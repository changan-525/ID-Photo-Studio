<div align="center">

# 拾像 · ID Photo Studio

**让每一张证件照，刚刚好。**

在浏览器本地，把生活照变成不同底色、不同尺寸的证件照。

React · TypeScript · MediaPipe · Canvas

[English](README.en.md) · [快速开始](#快速开始) · [部署到-github-pages](#部署到-github-pages) · [贡献指南](CONTRIBUTING.md)

</div>

![拾像桌面端预览，画面使用原创演示插画](docs/preview.png)

## 功能

- **本地智能换底**：MediaPipe 自动分割人像；白、蓝、红、灰、透明及自定义颜色。
- **常用与自定义尺寸**：一寸、二寸等六种预设；自定义宽高 10–100 mm，支持小数。
- **构图调整**：拖动位置、50%–250% 缩放、±15° 旋转、辅助线与原图对照；支持方向键移动。
- **原图画质与规范导出**：默认保留裁切范围内的原图有效像素；PNG 无损，JPG 最高质量；也可指定 150 / 300 / 600 DPI。
- **六寸相纸排版**：152.4 × 101.6 mm，相纸留边、照片间距、裁切标记和横竖排布择优。
- **无需账号或密钥**：不上传照片、不接入分析追踪；照片仅在当前页面内存中处理。
- **适配桌面与手机**：中文界面、拖放上传、键盘操作与错误恢复提示。

> 页面初始人物是项目原创的**演示插画**，用于体验尺寸、颜色和导出。上传普通照片后才会运行人像分割；已有明显透明背景的图片会直接进入编辑。

## 快速开始

需要 **Node.js 22.12+（建议 24 LTS）** 和 npm。

```bash
git clone https://github.com/changan-525/ID-Photo-Studio.git
cd ID-Photo-Studio
npm install
npm run dev
```

打开终端给出的本地地址，通常是 `http://127.0.0.1:5173`。

已经有 `package-lock.json` 时，自动化环境用 `npm ci`。启动与构建会自动运行 `setup:assets`，校验模型文件，并从已安装的 MediaPipe 包复制 WASM 文件。模型约 250 KB，已包含在源码；缺失或校验不匹配时，脚本从 Google 官方版本化地址重新下载。

安装依赖需要网络。运行时模型、WASM 与页面都来自同一站点，不依赖外部 CDN。**没有 Service Worker 离线缓存承诺**；若要稳定离线使用，请在依赖安装完成后运行本地服务器。

```bash
npm run build       # 类型检查并生成 dist/
npm run preview     # 预览生产构建
npm run check       # TypeScript 检查
npm test            # 15 项尺寸、画质、排版与文件元数据测试
```

不能通过双击 `index.html` 运行：ES Modules 与 WASM 需要 HTTP(S) 服务。

## 使用方式

1. 上传 JPG、PNG 或 WebP，支持最大 50 MB、4000 万像素。建议使用清晰的单人正面半身照。
2. 等待自动抠图，选择尺寸与背景。处理失败时会保留已读取的原图，可重新抠图或更换照片。
3. 拖动、缩放与微调旋转，检查头顶留白、肩部与发丝边缘。
4. 下载单张 PNG/JPG，或导出六寸 JPG 排版。

默认的“原图画质”会按证件照宽高比裁切，但不主动缩小原图，并根据实际像素写入对应 DPI。PNG 使用无损编码；JPG 即使选择最高质量也属于有损格式，因此对画质要求最高时应选 PNG。透明图选择 JPG 时会合成白底。六寸排版始终使用白色纸张背景，并限制为最高 600 DPI，避免生成超大打印文件。打印时选 **100% / 实际大小**，关闭“适应页面”，并选择 6 × 4 英寸相纸。

### 尺寸与 DPI

像素尺寸采用 `round(毫米 / 25.4 × DPI)`，例如 25 × 35 mm 在 300 DPI 下为 **295 × 413 px**。

| 预设   | 宽 × 高    | 300 DPI 像素 |
| ------ | ---------- | ------------ |
| 一寸   | 25 × 35 mm | 295 × 413    |
| 二寸   | 35 × 49 mm | 413 × 579    |
| 小一寸 | 22 × 32 mm | 260 × 378    |
| 小二寸 | 35 × 45 mm | 413 × 531    |
| 大一寸 | 33 × 48 mm | 390 × 567    |
| 方形照 | 51 × 51 mm | 602 × 602    |

这些名称与尺寸仅作快捷预设，不代表所有机构采用相同标准。导出 PNG 写入 `pHYs`（像素/米），JPEG 写入 `JFIF`（每英寸点数）；第三方查看器可能不显示或忽略这些字段。

## 测试

```bash
npx playwright install chromium
npm run test:e2e
```

默认运行五项浏览器测试；真实照片的模型集成测试需要额外设置 `PORTRAIT_FIXTURE`，因此默认跳过一项。测试覆盖原图像素保留、透明图换底、PNG 尺寸和密度、六寸导出、自定义尺寸、键盘调整、失败恢复与手机布局。

使用本地照片执行真实模型测试，示例为 PowerShell：

```powershell
$env:PORTRAIT_FIXTURE = 'C:\path\to\portrait.jpg'
# 可选：使用已安装的 Chrome，省去下载 Playwright Chromium
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
```

macOS/Linux：

```bash
PORTRAIT_FIXTURE=/path/to/portrait.jpg npm run test:e2e
```

集成测试使用普通人像，检查输出中同时存在透明背景与不透明前景，并检查浏览器没有发送外部请求。它验证模型接入，不代替对发丝和边缘的人工质量评估。

## GitHub 仓库

源码地址：[changan-525/ID-Photo-Studio](https://github.com/changan-525/ID-Photo-Studio)。欢迎 Star、Fork、提交 Issue 和 PR。

克隆后按上面的快速开始运行。如果你下载了 ZIP，直接在解压后的项目目录执行 `npm install` 和 `npm run dev` 即可。`.gitignore` 会排除依赖、构建输出、生成的 WASM 和测试记录。

## 部署到 GitHub Pages

1. 上传源码后，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. 打开 **Actions → Deploy GitHub Pages → Run workflow**，选择 `main` 并运行。
3. 工作流完成后，在部署任务或 Pages 设置中查看网站地址。

工作流只在手动运行时发布；普通 push/PR 运行 CI。每次想更新线上版本，再手动运行部署工作流即可。应用使用相对资源路径，完成 Pages 配置和部署后，本仓库对应地址为 `https://changan-525.github.io/ID-Photo-Studio/`。Fork 后请使用你自己账号和仓库对应的地址。

流程依据 [GitHub Pages 官方自定义工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) 配置。也可将 `dist/` 整体托管到任意支持静态文件的 HTTP(S) 服务器，必须保留 `models/`、`wasm/`、`assets/` 与 `licenses/`。

## 项目结构

```text
src/
  App.tsx                 编辑器界面、状态与导出交互
  styles.css              桌面/移动端界面样式
  lib/
    segmentation.ts       本地模型加载、人像蒙版与透明合成
    photo.ts              图片解码、裁切、尺寸和相纸排版
    dpi.ts                PNG / JPEG 密度元数据
    photo.test.ts         纯函数测试
public/
  demo.svg                原创演示插画
  models/                 固定版本模型，纳入源码
  wasm/                   自动生成，不纳入 Git
scripts/setup-assets.mjs  模型校验和本地资源准备
tests/editor.spec.ts      浏览器测试
.github/workflows/        CI 与手动 Pages 发布
```

## 实现与限制

- 使用 [MediaPipe Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js) 的 SelfieSegmenter square float16 v1；采用 CPU/WASM 推理。该模型的输出为单个人像置信度通道，经过平滑阈值后合成为透明图。
- 模型为轻量级人像分割，不是精细的发丝抠图或专业 alpha matting。复杂背景、透明配饰、遮挡或多人场景可能产生误差；不提供人工画笔修边。
- 推理目前运行在主线程，低性能设备处理期间可能短暂卡顿。取消会丢弃本次结果，不能中断已经开始的同步推理。
- 工作图保留原始像素，不再限制长边为 2400 px；为避免浏览器内存耗尽，输入与单张输出最多 4000 万像素。大图在低内存手机上处理会更慢。
- 修改背景和裁切需要重新编码，无法让导出文件与原文件二进制完全相同。无损指 PNG 编码不会再引入有损压缩；人像分割蒙版本身仍受轻量模型精度限制。
- 解码按浏览器的 EXIF 方向处理，导出重新绘制且不复制原图 EXIF/GPS。照片和处理结果不写入 LocalStorage 或服务器，刷新会清空。
- 项目不做人脸身份识别、自动头身比例校验、指定文件 KB 压缩或证件合规认证。
- 经本地 Chrome 实测；其他现代浏览器需支持 Canvas、WebAssembly、`createImageBitmap`。HEIC 不支持，请先转换。

## 常见问题

**模型加载失败？** 运行 `npm run setup:assets`，检查模型校验是否通过。生产部署检查 Network 中模型及 WASM 返回的是文件而非 HTML 404 页面。不要只上传 `dist/index.html`。

**下载模型超时？** 仓库已经包含固定版本模型。若文件缺失，可从 `scripts/setup-assets.mjs` 中的官方地址下载，放到 `public/models/selfie_segmenter.tflite`。脚本会检查 SHA-256，请不要关闭校验或改用来源不明模型。

**照片看起来被裁掉？** 默认按选定比例铺满画布。在预览中拖动调整位置，缩小滑块可显示更多内容；透明区域会显示所选背景。

**六寸排版提示放不下？** 相纸有 3 mm 留边。自定义照片的短边也超过可用纸高时无法排入，请减小尺寸或自行使用更大的纸张。

**印出来尺寸不对？** 先确认打印软件按实际尺寸而非适应页面输出。用毫米尺寸和像素/DPI 共同核对，不要只看文件查看器中的“分辨率”文字。

## 协议

项目代码与原创插画使用 [MIT](LICENSE)。MediaPipe 程序和模型使用 Apache-2.0，其授权独立于本项目 MIT 协议，详见 [第三方声明](THIRD_PARTY_NOTICES.md) 和 [模型官方说明卡](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf)。

欢迎提交问题和 PR。报告问题时，请使用不含个人隐私的复现材料。
