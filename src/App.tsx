import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent,
} from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Crop,
  Expand,
  CodeXml as Github,
  Grid2X2,
  ImagePlus,
  Info,
  LoaderCircle,
  LockKeyhole,
  Move,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  PRESETS,
  createPrintSheet,
  decodePhoto,
  exportCanvas,
  getPixelSize,
  getSourceQualitySize,
  renderPhoto,
  type ExportResolution,
  type Transform,
} from './lib/photo';

const INITIAL: Transform = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 };
const COLORS = [
  { name: '纯白', value: '#ffffff' },
  { name: '经典蓝', value: '#438edb' },
  { name: '标准红', value: '#d94b4b' },
  { name: '浅灰', value: '#e5e7eb' },
  { name: '透明', value: 'transparent' },
];

function hasTransparency(canvas: HTMLCanvasElement) {
  const sample = document.createElement('canvas');
  sample.width = sample.height = 64;
  const ctx = sample.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear++;
  return clear > 40;
}

function App() {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [original, setOriginal] = useState<HTMLCanvasElement | null>(null);
  const [isDemo, setIsDemo] = useState(true);
  const [cutout, setCutout] = useState(true);
  const [filename, setFilename] = useState('体验示例 · 原创人物插画');
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [customWidth, setCustomWidth] = useState('25');
  const [customHeight, setCustomHeight] = useState('35');
  const [resolution, setResolution] = useState<ExportResolution>('original');
  const [color, setColor] = useState('#438edb');
  const [customColor, setCustomColor] = useState('#91a8a0');
  const [transform, setTransform] = useState<Transform>(INITIAL);
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [guides, setGuides] = useState(false);
  const [compare, setCompare] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draggingFile, setDraggingFile] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLDialogElement>(null);
  const jobRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const currentPreset = PRESETS.find((item) => item.id === presetId);
  const widthMm = currentPreset?.widthMm ?? Number(customWidth);
  const heightMm = currentPreset?.heightMm ?? Number(customHeight);
  const validSize =
    Number.isFinite(widthMm) &&
    Number.isFinite(heightMm) &&
    widthMm >= 10 &&
    widthMm <= 100 &&
    heightMm >= 10 &&
    heightMm <= 100;
  const output =
    validSize && source
      ? resolution === 'original'
        ? getSourceQualitySize(source.width, source.height, widthMm, heightMm, transform.zoom)
        : { ...getPixelSize(widthMm, heightMm, resolution), dpi: resolution }
      : { width: 0, height: 0, dpi: resolution === 'original' ? 0 : resolution };
  const pixels = { width: output.width, height: output.height };
  const colorLabel = COLORS.find((item) => item.value === color)?.name ?? '自定义';

  useEffect(() => {
    let cancelled = false;
    const demo = new Image();
    demo.onload = () => {
      if (cancelled || jobRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 840;
      canvas.getContext('2d')!.drawImage(demo, 0, 0);
      setSource(canvas);
      setOriginal(canvas);
    };
    demo.src = `${import.meta.env.BASE_URL}demo.svg`;
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!source || !previewRef.current || !validSize) return;
    const scale = Math.min(1, 840 / Math.max(pixels.width, pixels.height));
    const rendered = renderPhoto(compare && original ? original : source, {
      width: Math.round(pixels.width * scale),
      height: Math.round(pixels.height * scale),
      background: color,
      transform,
    });
    const canvas = previewRef.current;
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    canvas.getContext('2d')!.drawImage(rendered, 0, 0);
  }, [source, original, pixels.width, pixels.height, color, transform, compare, validSize]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (aboutOpen) aboutRef.current?.showModal();
    else aboutRef.current?.close();
  }, [aboutOpen]);

  async function segment(canvas: HTMLCanvasElement, token: number) {
    const { removeBackground } = await import('./lib/segmentation');
    const result = await removeBackground(canvas, (message) => {
      if (jobRef.current === token) setProgress(message);
    });
    if (jobRef.current !== token) return;
    setSource(result);
    setCutout(true);
    setNotice('背景已移除，试试换一种底色');
  }

  async function loadFile(file?: File) {
    if (!file) return;
    const token = ++jobRef.current;
    setProcessing(true);
    setProgress('正在读取照片…');
    setError('');
    setNotice('');
    setCompare(false);
    try {
      const decoded = await decodePhoto(file);
      if (token !== jobRef.current) return;
      setOriginal(decoded);
      setSource(decoded);
      setFilename(file.name);
      setIsDemo(false);
      setTransform(INITIAL);
      const transparent = hasTransparency(decoded);
      setCutout(transparent);
      if (transparent) setNotice('已识别透明背景，可直接换底与裁切');
      else await segment(decoded, token);
    } catch (err) {
      if (token === jobRef.current)
        setError(err instanceof Error ? err.message : '处理失败，请换一张清晰的正面照片重试。');
    } finally {
      if (token === jobRef.current) setProcessing(false);
    }
  }

  async function retrySegmentation() {
    if (!original || processing) return;
    const token = ++jobRef.current;
    setProcessing(true);
    setProgress('正在准备智能抠图…');
    setError('');
    try {
      await segment(original, token);
    } catch (err) {
      if (token === jobRef.current)
        setError(err instanceof Error ? err.message : '抠图失败，请重试。');
    } finally {
      if (token === jobRef.current) setProcessing(false);
    }
  }

  function cancelProcessing() {
    jobRef.current++;
    setProcessing(false);
    setProgress('');
    setNotice('已停止本次处理，可选择其他照片');
  }

  async function download(sheet = false) {
    if (!source || !validSize || processing || exporting) return;
    setExporting(true);
    setError('');
    try {
      const exportDpi = output.dpi;
      const sheetDpi = Math.min(exportDpi, 600);
      const exportPixels = sheet ? getPixelSize(widthMm, heightMm, sheetDpi) : pixels;
      let canvas = renderPhoto(source, { ...exportPixels, background: color, transform });
      let count = 1;
      if (sheet) {
        const result = createPrintSheet(canvas, sheetDpi);
        canvas = result.canvas;
        count = result.count;
      }
      if (sheet && count === 0) throw new Error('当前尺寸放不进六寸相纸，请缩小照片尺寸后重试。');
      const blob = await exportCanvas(
        canvas,
        sheet ? 'jpeg' : format,
        sheet ? sheetDpi : exportDpi,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const qualityLabel =
        resolution === 'original' && !sheet
          ? `original-${exportDpi}dpi`
          : `${sheet ? sheetDpi : exportDpi}dpi`;
      anchor.download = `id-photo-${widthMm}x${heightMm}mm-${qualityLabel}${sheet ? '-sheet' : ''}.${sheet || format === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice(
        sheet
          ? `已导出六寸排版，共 ${count} 张照片`
          : `已导出 ${pixels.width} × ${pixels.height} px 证件照`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败，请重试。');
    } finally {
      setExporting(false);
    }
  }

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (processing || !source) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: transform.offsetX,
      offsetY: transform.offsetY,
    };
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const start = dragRef.current;
    if (!start) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTransform((prev) => ({
      ...prev,
      offsetX: Math.max(-1, Math.min(1, start.offsetX + (event.clientX - start.x) / rect.width)),
      offsetY: Math.max(-1, Math.min(1, start.offsetY + (event.clientY - start.y) / rect.height)),
    }));
  }
  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void loadFile(event.target.files?.[0]);
    event.target.value = '';
  }

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#" aria-label="拾像首页">
          <span className="brand-mark">
            <ScanFace size={24} strokeWidth={1.7} />
          </span>
          <span className="brand-name">
            拾像<span>ID PHOTO STUDIO</span>
          </span>
        </a>
        <nav aria-label="主导航">
          <a className="nav-active" href="#studio">
            制作证件照
          </a>
          <a href="#guide">使用指南</a>
          <button className="github-link" onClick={() => setAboutOpen(true)}>
            <Github size={17} /> 开源项目 <ArrowRight size={14} />
          </button>
        </nav>
      </header>

      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">
              <span /> A LITTLE PHOTO. A NEW BEGINNING.
            </p>
            <h1>
              让每一张证件照，<span>刚刚好。</span>
              <span className="heading-star">✳</span>
            </h1>
            <p className="intro-description">换个底色，选好尺寸。把新的开始，交给最好的自己。</p>
          </div>
          <div className="privacy-note">
            <span className="privacy-icon">
              <ShieldCheck size={25} strokeWidth={1.5} />
            </span>
            <div>
              <strong>你的照片，只属于你</strong>
              <span>本地处理 · 无需登录 · 免费开源</span>
            </div>
          </div>
        </section>

        <div className="workspace-heading" id="studio">
          <div>
            <span className="section-index">01</span>
            <h2>证件照工作台</h2>
            <span className="workspace-caption">YOUR MINI PHOTO STUDIO</span>
          </div>
          <span className="local-status">
            <span /> 所有处理均在浏览器内完成
          </span>
        </div>

        <section className="studio-grid" aria-label="证件照编辑器">
          <aside className="left-panel panel">
            <div className="panel-section upload-section">
              <div className="section-title">
                <span className="step-number">1</span>
                <h3>选择照片</h3>
                <span className="section-tag">START HERE</span>
              </div>
              <button
                className={`upload-area ${draggingFile ? 'drag-over' : ''}`}
                onClick={() => uploadRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDraggingFile(true);
                }}
                onDragLeave={() => setDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDraggingFile(false);
                  void loadFile(e.dataTransfer.files[0]);
                }}
                aria-label="上传照片"
              >
                <span className="upload-icon">
                  <ImagePlus size={25} strokeWidth={1.5} />
                </span>
                <strong>点击上传，或拖入照片</strong>
                <span>JPG / PNG / WebP · 最大 50 MB</span>
              </button>
              <input
                ref={uploadRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFileChange}
                className="sr-only"
                aria-label="选择照片文件"
              />
              <p className="tiny-note">
                <Sparkles size={13} /> 上传后自动识别人像、移除背景
              </p>
              {!isDemo && (
                <div className="loaded-file">
                  <span title={filename}>{filename}</span>
                  {cutout ? (
                    <CheckCheck size={15} />
                  ) : (
                    <button onClick={retrySegmentation} disabled={processing}>
                      重新抠图
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="panel-section">
              <div className="section-title">
                <span className="step-number">2</span>
                <h3>照片尺寸</h3>
                <Crop size={16} className="title-icon" />
              </div>
              <div className="preset-grid">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`preset-button ${presetId === preset.id ? 'selected' : ''}`}
                    onClick={() => setPresetId(preset.id)}
                    aria-pressed={presetId === preset.id}
                  >
                    <strong>{preset.name}</strong>
                    <span>
                      {preset.widthMm} × {preset.heightMm} mm
                    </span>
                    {presetId === preset.id && <Check size={13} />}
                  </button>
                ))}
              </div>
              <button
                className={`custom-size-button ${presetId === 'custom' ? 'selected' : ''}`}
                onClick={() => setPresetId('custom')}
                aria-pressed={presetId === 'custom'}
              >
                <SlidersHorizontal size={14} /> 自定义尺寸 <span>mm</span>
              </button>
              {presetId === 'custom' && (
                <div className="custom-dimensions">
                  <label>
                    宽度
                    <input
                      type="number"
                      min="10"
                      max="100"
                      step="0.1"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(e.target.value)}
                    />
                  </label>
                  <span>×</span>
                  <label>
                    高度
                    <input
                      type="number"
                      min="10"
                      max="100"
                      step="0.1"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                    />
                  </label>
                </div>
              )}
              {!validSize && (
                <p className="field-error" role="alert">
                  宽高需在 10–100 mm 之间
                </p>
              )}
              <div className="dpi-control">
                <label htmlFor="dpi">输出分辨率</label>
                <div className="select-wrap">
                  <select
                    id="dpi"
                    value={resolution}
                    onChange={(e) =>
                      setResolution(
                        e.target.value === 'original'
                          ? 'original'
                          : (Number(e.target.value) as ExportResolution),
                      )
                    }
                  >
                    <option value="original">原图画质 · 推荐</option>
                    <option value={150}>150 DPI</option>
                    <option value={300}>300 DPI</option>
                    <option value={600}>600 DPI</option>
                  </select>
                  <ChevronDown size={13} />
                </div>
              </div>
              <p className="size-note">预设仅提供常用尺寸，请以办理机构要求为准。</p>
            </div>

            <div className="panel-section background-section">
              <div className="section-title">
                <span className="step-number">3</span>
                <h3>背景颜色</h3>
                <span className="current-color">{colorLabel}</span>
              </div>
              <div className="swatches" role="group" aria-label="背景颜色">
                {COLORS.map((item) => (
                  <button
                    key={item.value}
                    className={`swatch ${item.value === 'transparent' ? 'checker' : ''} ${color === item.value ? 'active' : ''}`}
                    style={{ '--swatch': item.value } as CSSProperties}
                    onClick={() => {
                      setColor(item.value);
                      if (item.value === 'transparent') setFormat('png');
                    }}
                    aria-label={`${item.name}背景`}
                    aria-pressed={color === item.value}
                    title={item.name}
                  >
                    {color === item.value && (
                      <Check
                        size={16}
                        color={['#438edb', '#d94b4b'].includes(color) ? '#fff' : '#25343b'}
                      />
                    )}
                  </button>
                ))}
              </div>
              <label className="color-picker">
                <span className="custom-color-dot" style={{ backgroundColor: customColor }} />
                <span>自定义颜色</span>
                <span className="color-hex">{customColor.toUpperCase()}</span>
                <input
                  type="color"
                  aria-label="自定义背景颜色"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    setColor(e.target.value);
                  }}
                />
              </label>
              {!cutout && !processing && (
                <p className="size-note">当前保留原图背景，完成抠图后即可换色。</p>
              )}
            </div>
          </aside>

          <section className="preview-panel panel" aria-label="照片预览">
            <div className="preview-toolbar">
              <span>
                <span className="live-dot" /> 实时预览
              </span>
              <div>
                <button
                  className={guides ? 'tool-active' : ''}
                  onClick={() => setGuides(!guides)}
                  aria-label="切换构图辅助线"
                  aria-pressed={guides}
                  title="构图辅助线"
                >
                  <Grid2X2 size={17} />
                </button>
                <button
                  onClick={() => {
                    setTransform(INITIAL);
                    setCompare(false);
                  }}
                  aria-label="重置裁切"
                  title="重置裁切"
                >
                  <RotateCcw size={16} />
                </button>
                <span className="toolbar-divider" />
                <button
                  className={`compare-button ${compare ? 'tool-active' : ''}`}
                  onClick={() => setCompare(!compare)}
                  aria-pressed={compare}
                >
                  {compare ? '查看效果' : '查看原图'}
                </button>
              </div>
            </div>
            <div className="preview-stage">
              <span className="stage-corner top-left" />
              <span className="stage-corner top-right" />
              <span className="stage-corner bottom-left" />
              <span className="stage-corner bottom-right" />
              <span className="preview-label">
                {isDemo ? 'ILLUSTRATION / DEMO' : 'YOUR NEXT CHAPTER'}
              </span>
              <div
                className="photo-measure"
                style={
                  {
                    '--photo-ratio': `${validSize ? widthMm : 25} / ${validSize ? heightMm : 35}`,
                    '--photo-width': `${Math.min(295, 440 * (validSize ? widthMm / heightMm : 25 / 35))}px`,
                  } as CSSProperties
                }
              >
                <span className="measure-horizontal">{validSize ? widthMm : '—'} mm</span>
                <div className="photo-frame checker">
                  <canvas
                    ref={previewRef}
                    aria-label="证件照预览，可拖动调整位置"
                    tabIndex={0}
                    onPointerDown={pointerDown}
                    onPointerMove={pointerMove}
                    onPointerUp={() => {
                      dragRef.current = null;
                    }}
                    onPointerCancel={() => {
                      dragRef.current = null;
                    }}
                    onKeyDown={(e) => {
                      const movements: Record<string, [number, number]> = {
                        ArrowLeft: [-0.01, 0],
                        ArrowRight: [0.01, 0],
                        ArrowUp: [0, -0.01],
                        ArrowDown: [0, 0.01],
                      };
                      const movement = movements[e.key];
                      if (movement) {
                        e.preventDefault();
                        setTransform((prev) => ({
                          ...prev,
                          offsetX: Math.max(-1, Math.min(1, prev.offsetX + movement[0])),
                          offsetY: Math.max(-1, Math.min(1, prev.offsetY + movement[1])),
                        }));
                      }
                    }}
                  />
                  {guides && (
                    <div className="composition-guides" aria-hidden="true">
                      <div className="head-guide" />
                      <i />
                      <i />
                      <b />
                      <b />
                    </div>
                  )}
                  {processing && (
                    <div className="processing-overlay">
                      <LoaderCircle className="spin" size={28} />
                      <strong>{progress}</strong>
                      <span>照片始终留在你的设备上</span>
                      <button onClick={cancelProcessing}>取消处理</button>
                    </div>
                  )}
                </div>
                <span className="measure-vertical">{validSize ? heightMm : '—'} mm</span>
              </div>
              <div className="preview-caption">
                {isDemo ? (
                  <>
                    <span className="demo-badge">演示插画</span> 上传自己的照片，开启制作
                  </>
                ) : (
                  <>
                    <Move size={13} /> 拖动照片，找到合适的位置
                  </>
                )}
              </div>
            </div>
            <div className="preview-footer">
              <span>
                <LockKeyhole size={13} /> 照片不上传至服务器
              </span>
              <span>
                {pixels.width} × {pixels.height} px <i /> {output.dpi} DPI
              </span>
            </div>
          </section>

          <aside className="right-column">
            <div className="adjust-panel panel">
              <div className="section-title">
                <SlidersHorizontal size={17} />
                <h3>构图微调</h3>
                <button className="text-button" onClick={() => setTransform(INITIAL)}>
                  重置
                </button>
              </div>
              <div className="slider-control">
                <label htmlFor="zoom">
                  <Expand size={14} /> 人像缩放 <span>{Math.round(transform.zoom * 100)}%</span>
                </label>
                <input
                  id="zoom"
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.01"
                  value={transform.zoom}
                  onChange={(e) => setTransform({ ...transform, zoom: Number(e.target.value) })}
                />
                <div className="range-labels">
                  <span>缩小</span>
                  <span>放大</span>
                </div>
              </div>
              <div className="slider-control">
                <label htmlFor="rotation">
                  <RotateCcw size={14} /> 旋转校正 <span>{transform.rotation}°</span>
                </label>
                <input
                  id="rotation"
                  type="range"
                  min="-15"
                  max="15"
                  step="1"
                  value={transform.rotation}
                  onChange={(e) => setTransform({ ...transform, rotation: Number(e.target.value) })}
                />
              </div>
              <p className="adjust-tip">
                <Move size={14} /> 在预览中拖动调整人像位置
                <br />
                <span>也可以聚焦照片后使用方向键</span>
              </p>
            </div>

            <div className="export-panel panel">
              <div className="section-title">
                <span className="step-number">4</span>
                <h3>保存这张新开始</h3>
              </div>
              <div className="output-summary">
                <span>
                  {currentPreset?.name ?? '自定义尺寸'}
                  <b>{colorLabel}底</b>
                </span>
                <strong>
                  {validSize ? `${widthMm} × ${heightMm}` : '—'} <small>mm</small>
                </strong>
                <p>
                  {pixels.width} × {pixels.height} px / {output.dpi} DPI
                </p>
              </div>
              <div className="format-control" role="group" aria-label="导出格式">
                <button
                  aria-pressed={format === 'png'}
                  className={format === 'png' ? 'selected' : ''}
                  onClick={() => setFormat('png')}
                >
                  PNG <span>无损</span>
                </button>
                <button
                  aria-pressed={format === 'jpeg'}
                  className={format === 'jpeg' ? 'selected' : ''}
                  onClick={() => setFormat('jpeg')}
                >
                  JPG <span>通用</span>
                </button>
              </div>
              {format === 'jpeg' && color === 'transparent' && (
                <p className="size-note">JPG 不支持透明，将使用白色背景。</p>
              )}
              <button
                className="download-button"
                disabled={!source || processing || exporting || !validSize}
                onClick={() => void download()}
              >
                {exporting ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <ArrowDownToLine size={18} />
                )}{' '}
                下载证件照 <ArrowRight size={16} />
              </button>
              <button
                className="sheet-button"
                disabled={!source || processing || exporting || !validSize}
                onClick={() => void download(true)}
              >
                <Grid2X2 size={16} /> 导出六寸排版 <span>JPG</span>
              </button>
              <p className="export-note">
                {resolution === 'original'
                  ? '保留原图有效像素 · PNG 无损'
                  : '指定打印精度 · 无水印'}
              </p>
            </div>
            <div className="help-note">
              <span>
                <Info size={15} /> 拍照小贴士
              </span>
              <p>正面平视，光线均匀，露出完整头部与双肩。清晰的原图会让抠图效果更好。</p>
            </div>
          </aside>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <Info size={18} />
            <span>{error}</span>
            <button aria-label="关闭错误提示" onClick={() => setError('')}>
              <X size={17} />
            </button>
          </div>
        )}
        <div className="process-status sr-only" role="status" aria-live="polite">
          {processing ? progress : notice}
        </div>
        {notice && (
          <div className="toast">
            <Check size={16} />
            {notice}
          </div>
        )}

        <section className="guide-section" id="guide">
          <div className="guide-heading">
            <p className="eyebrow">SMALL STEPS, GREAT RESULTS.</p>
            <h2>从生活照，到证件照。只需三步。</h2>
            <p>简单一点，把时间留给更重要的事。</p>
          </div>
          <div className="guide-cards">
            <article>
              <span>01</span>
              <ImagePlus size={23} />
              <h3>选一张自然的自己</h3>
              <p>上传清晰的单人正面照，自动分离人像和背景。</p>
            </article>
            <article>
              <span>02</span>
              <Crop size={23} />
              <h3>调到恰到好处</h3>
              <p>选择所需尺寸和底色，轻轻拖动，调整构图。</p>
            </article>
            <article>
              <span>03</span>
              <ArrowDownToLine size={23} />
              <h3>为下一步做好准备</h3>
              <p>保存电子照片，或导出六寸排版，以实际尺寸打印。</p>
            </article>
          </div>
        </section>
        <p className="disclaimer">
          拾像提供照片编辑与排版，不进行证件照合规认证。发丝、复杂背景可能需进一步修整；请按办理机构要求核对尺寸、头部比例与背景颜色。
        </p>
      </main>
      <footer className="site-footer">
        <span className="footer-brand">
          <ScanFace size={19} /> 拾像 <span>让每个新开始，都有好印象。</span>
        </span>
        <span>MADE WITH CARE · OPEN SOURCE · MIT</span>
      </footer>
      <dialog
        ref={aboutRef}
        onCancel={() => setAboutOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setAboutOpen(false);
        }}
      >
        <button
          className="dialog-close"
          onClick={() => setAboutOpen(false)}
          aria-label="关闭开源项目介绍"
        >
          <X size={20} />
        </button>
        <Github size={30} />
        <h2>拾像 · ID Photo Studio</h2>
        <p>一个开源、免费的本地证件照编辑器。</p>
        <p>
          基于 React、TypeScript 与 MediaPipe 构建，使用 MIT 协议开放项目代码。模型遵循独立的 Apache
          2.0 协议。
        </p>
        <p>
          源码附带中文使用指南、自动化测试与 GitHub Pages 部署工作流。查看项目中的
          README.md，即可开始开发与部署。
        </p>
        <button className="download-button" onClick={() => setAboutOpen(false)}>
          继续制作 <ArrowRight size={16} />
        </button>
      </dialog>
    </>
  );
}

export default App;
