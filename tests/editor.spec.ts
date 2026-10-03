import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function fixture(page: Page, transparent = true, width = 300, height = 420) {
  const data = await page.evaluate(
    ({ alpha, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      if (!alpha) {
        context.fillStyle = '#ddd';
        context.fillRect(0, 0, width, height);
      }
      context.fillStyle = '#805040';
      context.fillRect(width * 0.27, height * 0.17, width * 0.46, height * 0.83);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { alpha: transparent, width, height },
  );
  return { name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

test('edits a transparent portrait and exports exact size, colour, DPI and print sheet', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:5173') && !request.url().startsWith('data:'))
      externalRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByLabel('选择照片文件').setInputFiles(await fixture(page));
  await expect(page.locator('.toast')).toHaveText('已识别透明背景，可直接换底与裁切');
  await expect(page.getByLabel('输出分辨率')).toHaveValue('original');
  await expect(page.locator('.output-summary')).toContainText('300 × 420 px');
  const originalDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载证件照', exact: true }).click();
  const originalDownload = await originalDownloadPromise;
  const originalBytes = await readFile((await originalDownload.path())!);
  expect(originalDownload.suggestedFilename()).toBe('id-photo-25x35mm-original-305dpi.png');
  expect([originalBytes.readUInt32BE(16), originalBytes.readUInt32BE(20)]).toEqual([300, 420]);
  await page.getByLabel('输出分辨率').selectOption('300');
  await page.getByRole('button', { name: '标准红背景', exact: true }).click();
  const canvas = page.locator('.photo-frame canvas');
  expect(
    await canvas.evaluate((element) =>
      Array.from((element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data),
    ),
  ).toEqual([217, 75, 75, 255]);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载证件照', exact: true }).click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  expect(download.suggestedFilename()).toBe('id-photo-25x35mm-300dpi.png');
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([295, 413]);
  const physical = bytes.indexOf('pHYs');
  expect(bytes.readUInt32BE(physical + 4)).toBe(11811);
  await page.getByRole('button', { name: '透明背景', exact: true }).click();
  expect(
    await canvas.evaluate(
      (element) =>
        (element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data[3],
    ),
  ).toBe(0);
  const sheetPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出六寸排版 JPG' }).click();
  const sheet = await sheetPromise;
  expect(sheet.suggestedFilename()).toContain('-sheet.jpg');
  const sheetBytes = await readFile((await sheet.path())!);
  const jfif = sheetBytes.indexOf('JFIF\0');
  expect(jfif).toBeGreaterThan(0);
  expect(sheetBytes[jfif + 7]).toBe(1);
  expect(sheetBytes.readUInt16BE(jfif + 8)).toBe(300);
  expect(sheetBytes.readUInt16BE(jfif + 10)).toBe(300);
  const sheetSize = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
    const size = [bitmap.width, bitmap.height];
    bitmap.close();
    return size;
  }, sheetBytes.toString('base64'));
  expect(sheetSize).toEqual([1800, 1200]);
  await expect(page.locator('.toast')).toHaveText('已导出六寸排版，共 12 张照片');
  expect(externalRequests).toEqual([]);
});

test('keeps uploads above the former 2400px limit at source resolution', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('选择照片文件').setInputFiles(await fixture(page, true, 2500, 3500));
  await expect(page.locator('.output-summary')).toContainText('2500 × 3500 px');
  await expect(page.getByLabel('输出分辨率')).toHaveValue('original');
});

test('custom dimensions validate, resizing and keyboard composition work', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.photo-frame canvas')).toHaveAttribute('width', '600');
  await page.getByRole('button', { name: '自定义尺寸 mm' }).click();
  await page.getByLabel('宽度', { exact: true }).fill('0');
  await expect(page.getByRole('button', { name: '下载证件照', exact: true })).toBeDisabled();
  await page.getByLabel('宽度', { exact: true }).fill('50.8');
  await page.getByLabel('高度', { exact: true }).fill('50.8');
  await page.getByLabel('输出分辨率').selectOption('150');
  await expect(page.locator('.photo-frame canvas')).toHaveAttribute('width', '300');
  await expect(page.locator('.photo-frame canvas')).toHaveAttribute('height', '300');
  await page.getByRole('button', { name: '切换构图辅助线' }).click();
  await expect(page.locator('.composition-guides')).toBeVisible();
  const canvas = page.locator('.photo-frame canvas');
  const before = await canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL()))
    .not.toBe(before);
  await page.getByRole('button', { name: '重置裁切', exact: true }).click();
  await expect
    .poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL()))
    .toBe(before);
});

test('unsupported uploads and model loading failure give recoverable errors', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('选择照片文件')
    .setInputFiles({ name: 'file.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert')).toContainText('请选择 JPG');
  await page.route('**/models/selfie_segmenter.tflite', (route) => route.abort());
  await page.getByLabel('选择照片文件').setInputFiles(await fixture(page, false));
  await expect(page.getByRole('alert')).toContainText('人像模型加载失败', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: '重新抠图', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '下载证件照', exact: true })).toBeEnabled();
});

test('mobile layout has no horizontal overflow and export stays reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: '下载证件照', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '下载证件照', exact: true })).toBeVisible();
});

test('real MediaPipe model removes portrait background without external requests', async ({
  page,
}) => {
  test.skip(
    !process.env.PORTRAIT_FIXTURE,
    'Set PORTRAIT_FIXTURE to a local portrait for an actual model integration test.',
  );
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.getByLabel('选择照片文件').setInputFiles(process.env.PORTRAIT_FIXTURE!);
  await expect(page.locator('.toast')).toHaveText('背景已移除，试试换一种底色', {
    timeout: 45_000,
  });
  await page.getByRole('button', { name: '透明背景', exact: true }).click();
  const alpha = await page.locator('.photo-frame canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0,
      opaque = 0;
    for (let i = 3; i < bytes.length; i += 4) {
      if (bytes[i] < 10) transparent++;
      if (bytes[i] > 245) opaque++;
    }
    return { transparent, opaque, total: bytes.length / 4 };
  });
  expect(alpha.transparent / alpha.total).toBeGreaterThan(0.1);
  expect(alpha.opaque / alpha.total).toBeGreaterThan(0.1);
  expect(requests.some((url) => url.includes('/models/selfie_segmenter.tflite'))).toBe(true);
  expect(
    requests.filter((url) => !url.startsWith('http://127.0.0.1:5173') && !url.startsWith('data:')),
  ).toEqual([]);
});
