import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

let loading: Promise<ImageSegmenter> | null = null;
async function getSegmenter() {
  if (!loading) {
    loading = (async () => {
      const root = new URL(import.meta.env.BASE_URL, window.location.href);
      const vision = await FilesetResolver.forVisionTasks(new URL('wasm', root).href);
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: new URL('models/selfie_segmenter.tflite', root).href,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })().catch((error: unknown) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}
const nextFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));

/** The fixed square SelfieSegmenter v1 model has one foreground-confidence channel. */
export async function removeBackground(
  source: HTMLCanvasElement,
  onProgress?: (message: string) => void,
): Promise<HTMLCanvasElement> {
  onProgress?.('正在加载本地人像模型…');
  let segmenter: ImageSegmenter;
  try {
    segmenter = await getSegmenter();
  } catch {
    throw new Error(
      '人像模型加载失败。请确认站点的 models 与 wasm 文件可访问，或运行 npm run setup:assets 后重试。',
    );
  }
  onProgress?.('正在识别人像与背景…');
  await nextFrame();
  try {
    const result = segmenter.segment(source);
    try {
      const mask = result.confidenceMasks?.[0];
      if (!mask) throw new Error('模型未返回人像蒙版');
      const confidence = mask.getAsFloat32Array();
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = mask.width;
      maskCanvas.height = mask.height;
      const maskContext = maskCanvas.getContext('2d')!;
      const pixels = maskContext.createImageData(mask.width, mask.height);
      let foreground = 0;
      for (let i = 0; i < confidence.length; i++) {
        const t = Math.max(0, Math.min(1, (confidence[i] - 0.15) / 0.7));
        const alpha = t * t * (3 - 2 * t);
        pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255;
        pixels.data[i * 4 + 3] = Math.round(alpha * 255);
        foreground += alpha;
      }
      if (foreground / confidence.length < 0.005)
        throw new Error('未检测到清晰的人像，请选择完整露出头部与双肩的单人正面照片。');
      maskContext.putImageData(pixels, 0, 0);
      const output = document.createElement('canvas');
      output.width = source.width;
      output.height = source.height;
      const ctx = output.getContext('2d')!;
      ctx.drawImage(source, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(maskCanvas, 0, 0, source.width, source.height);
      ctx.globalCompositeOperation = 'source-over';
      onProgress?.('抠图完成');
      return output;
    } finally {
      result.close();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('未检测到')) throw error;
    throw new Error('人像处理失败，请使用新版 Chrome 或 Edge，并尝试一张光线均匀的单人正面照片。');
  }
}
