import { embedDpi } from './dpi';

export const PRESETS = [
  { id: 'one-inch', name: '一寸', widthMm: 25, heightMm: 35 },
  { id: 'two-inch', name: '二寸', widthMm: 35, heightMm: 49 },
  { id: 'small-one-inch', name: '小一寸', widthMm: 22, heightMm: 32 },
  { id: 'small-two-inch', name: '小二寸', widthMm: 35, heightMm: 45 },
  { id: 'large-one-inch', name: '大一寸', widthMm: 33, heightMm: 48 },
  { id: 'square', name: '方形照', widthMm: 51, heightMm: 51 },
];
export type Transform = { zoom: number; offsetX: number; offsetY: number; rotation: number };
export type ExportResolution = 150 | 300 | 600 | 'original';
const MAX_CANVAS_PIXELS = 40_000_000;
export function mmToPx(mm: number, dpi: number) {
  return Math.round((mm * dpi) / 25.4);
}
export function getPixelSize(widthMm: number, heightMm: number, dpi: number) {
  if (![widthMm, heightMm, dpi].every((v) => Number.isFinite(v) && v > 0))
    throw new Error('尺寸与 DPI 必须为正数');
  return { width: mmToPx(widthMm, dpi), height: mmToPx(heightMm, dpi) };
}

/** Largest target-aspect canvas that does not interpolate source pixels upward. */
export function getSourceQualitySize(
  sourceWidth: number,
  sourceHeight: number,
  widthMm: number,
  heightMm: number,
  zoom = 1,
) {
  if (
    ![sourceWidth, sourceHeight, widthMm, heightMm, zoom].every((v) => Number.isFinite(v) && v > 0)
  )
    throw new Error('原图尺寸、输出尺寸与缩放必须为正数');
  const aspect = widthMm / heightMm;
  let width: number;
  let height: number;
  if (sourceWidth / sourceHeight >= aspect) {
    height = Math.max(1, Math.floor(sourceHeight / zoom));
    width = Math.max(1, Math.floor(height * aspect));
  } else {
    width = Math.max(1, Math.floor(sourceWidth / zoom));
    height = Math.max(1, Math.floor(width / aspect));
  }
  if (width * height > MAX_CANVAS_PIXELS) {
    const scale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(width / aspect));
  }
  return { width, height, dpi: Math.max(1, Math.round((width * 25.4) / widthMm)) };
}
function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas，请使用新版浏览器。');
  return { canvas, ctx };
}

export async function decodePhoto(file: File): Promise<HTMLCanvasElement> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('请选择 JPG、PNG 或 WebP 图片；HEIC 请先转换格式。');
  if (file.size > 50 * 1024 * 1024)
    throw new Error('照片超过 50 MB，请在不降低像素尺寸的前提下优化文件后重试。');
  if (!file.size) throw new Error('这张照片是空文件，请重新选择。');
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('无法读取这张图片，请确认文件未损坏，并使用新版 Chrome、Edge 或 Safari。');
  }
  try {
    if (image.width * image.height > 40_000_000)
      throw new Error('图片超过 4000 万像素，请先缩小后重试。');
    const { canvas, ctx } = makeCanvas(image.width, image.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    image.close();
  }
}

export function renderPhoto(
  source: HTMLCanvasElement,
  options: { width: number; height: number; background: string; transform: Transform },
) {
  const { width, height, background, transform } = options;
  if (width < 1 || height < 1 || width * height > MAX_CANVAS_PIXELS)
    throw new Error('输出尺寸超出支持范围');
  const { canvas, ctx } = makeCanvas(width, height);
  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  const scale = Math.max(width / source.width, height / source.height) * transform.zoom;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(width * (0.5 + transform.offsetX), height * (0.5 + transform.offsetY));
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.drawImage(
    source,
    (-source.width * scale) / 2,
    (-source.height * scale) / 2,
    source.width * scale,
    source.height * scale,
  );
  return canvas;
}

export function getPrintLayout(photoWidth: number, photoHeight: number, dpi: number) {
  const width = mmToPx(152.4, dpi);
  const height = mmToPx(101.6, dpi);
  const margin = mmToPx(3, dpi);
  const gap = mmToPx(2, dpi);
  const candidates = [false, true].map((rotated) => {
    const cellWidth = rotated ? photoHeight : photoWidth;
    const cellHeight = rotated ? photoWidth : photoHeight;
    const columns = Math.max(0, Math.floor((width - 2 * margin + gap) / (cellWidth + gap)));
    const rows = Math.max(0, Math.floor((height - 2 * margin + gap) / (cellHeight + gap)));
    return { rotated, cellWidth, cellHeight, columns, rows, count: columns * rows };
  });
  const chosen = candidates[1].count > candidates[0].count ? candidates[1] : candidates[0];
  const startX =
    (width - (chosen.columns * chosen.cellWidth + Math.max(0, chosen.columns - 1) * gap)) / 2;
  const startY =
    (height - (chosen.rows * chosen.cellHeight + Math.max(0, chosen.rows - 1) * gap)) / 2;
  const cells = Array.from({ length: chosen.count }, (_, i) => ({
    x: Math.round(startX + (i % chosen.columns) * (chosen.cellWidth + gap)),
    y: Math.round(startY + Math.floor(i / chosen.columns) * (chosen.cellHeight + gap)),
  }));
  return { width, height, margin, gap, ...chosen, cells };
}

export function createPrintSheet(photo: HTMLCanvasElement, dpi: number) {
  const layout = getPrintLayout(photo.width, photo.height, dpi);
  const { canvas, ctx } = makeCanvas(layout.width, layout.height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const cell of layout.cells) {
    ctx.save();
    ctx.translate(cell.x, cell.y);
    if (layout.rotated) {
      ctx.translate(layout.cellWidth, 0);
      ctx.rotate(Math.PI / 2);
    }
    ctx.drawImage(photo, 0, 0);
    ctx.restore();
    ctx.strokeStyle = '#b5b5b5';
    ctx.lineWidth = Math.max(1, dpi / 300);
    const tick = mmToPx(1, dpi);
    const distance = mmToPx(0.35, dpi);
    for (const x of [cell.x, cell.x + layout.cellWidth])
      for (const y of [cell.y, cell.y + layout.cellHeight]) {
        const sx = x === cell.x ? -1 : 1;
        const sy = y === cell.y ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x + sx * distance, y);
        ctx.lineTo(x + sx * tick, y);
        ctx.moveTo(x, y + sy * distance);
        ctx.lineTo(x, y + sy * tick);
        ctx.stroke();
      }
  }
  return { canvas, count: layout.count };
}

export async function exportCanvas(source: HTMLCanvasElement, format: 'png' | 'jpeg', dpi: number) {
  let canvas = source;
  if (format === 'jpeg') {
    const next = makeCanvas(source.width, source.height);
    next.ctx.fillStyle = '#fff';
    next.ctx.fillRect(0, 0, source.width, source.height);
    next.ctx.drawImage(source, 0, 0);
    canvas = next.canvas;
  }
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('导出图片失败'))),
      mime,
      1,
    ),
  );
  const bytes = embedDpi(new Uint8Array(await blob.arrayBuffer()), format, dpi);
  return new Blob([bytes], { type: mime });
}
