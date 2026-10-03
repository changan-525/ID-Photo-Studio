import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
const expectedHash = '191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b';
const modelDir = path.join(root, 'public/models');
const modelPath = path.join(modelDir, 'selfie_segmenter.tflite');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(modelDir, { recursive: true });
let valid = false;
try {
  valid = hash(await readFile(modelPath)) === expectedHash;
} catch {
  /* First setup. */
}
if (!valid) {
  console.log('Downloading the pinned MediaPipe portrait model (250 KB)…');
  const response = await fetch(modelUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok)
    throw new Error(`Model download failed: HTTP ${response.status}. See README troubleshooting.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (hash(bytes) !== expectedHash)
    throw new Error('Model checksum mismatch; refusing to use this file.');
  await writeFile(`${modelPath}.tmp`, bytes);
  await rename(`${modelPath}.tmp`, modelPath);
}
const wasmSource = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmTarget = path.join(root, 'public/wasm');
await mkdir(wasmTarget, { recursive: true });
for (const name of await readdir(wasmSource)) {
  if (/\.(wasm|js)$/.test(name))
    await copyFile(path.join(wasmSource, name), path.join(wasmTarget, name));
}
console.log('Local model verified; MediaPipe WASM assets ready.');
const licenseTarget = path.join(root, 'public/licenses');
await mkdir(licenseTarget, { recursive: true });
for (const name of await readdir(path.join(root, 'licenses'))) {
  await copyFile(path.join(root, 'licenses', name), path.join(licenseTarget, name));
}
await copyFile(path.join(root, 'LICENSE'), path.join(licenseTarget, 'Project-MIT.txt'));
await copyFile(
  path.join(root, 'THIRD_PARTY_NOTICES.md'),
  path.join(root, 'public/THIRD_PARTY_NOTICES.md'),
);
