import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import pngToIco from 'png-to-ico';

const root = fileURLToPath(new URL('../', import.meta.url));
const resourceDirectory = path.join(root, 'resources');
await mkdir(resourceDirectory, { recursive: true });
const svg = await readFile(path.join(root, 'public/favicon.svg'), 'utf8');
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  async function renderIcon(output, size, padding = 0) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent}body{padding:${padding}px}svg{width:100%;height:100%;display:block}</style>${svg}`,
    );
    await page.screenshot({ path: output, omitBackground: true });
    await page.close();
  }

  await renderIcon(path.join(resourceDirectory, 'icon.png'), 1024);

  const androidResources = path.join(root, 'android/app/src/main/res');
  try {
    await access(androidResources);
    const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
    for (const [density, size] of Object.entries(densities)) {
      const directory = path.join(androidResources, `mipmap-${density}`);
      await renderIcon(path.join(directory, 'ic_launcher.png'), size);
      await renderIcon(path.join(directory, 'ic_launcher_round.png'), size);
      await renderIcon(
        path.join(directory, 'ic_launcher_foreground.png'),
        size * 2.25,
        size * 0.42,
      );
    }
  } catch {
    console.log('Android project not present; skipped Android launcher icon generation.');
  }
} finally {
  await browser.close();
}
await writeFile(
  path.join(resourceDirectory, 'icon.ico'),
  await pngToIco(path.join(resourceDirectory, 'icon.png')),
);
console.log('Generated available Windows and Android icons.');
