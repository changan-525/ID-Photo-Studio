/** Replace density metadata on browser-generated files; never copy source EXIF. */
export function embedDpi(
  bytes: Uint8Array,
  format: 'png' | 'jpeg',
  dpi: number,
): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(dpi) || dpi < 1 || dpi > 65535) throw new Error('无效的 DPI');
  if (format === 'jpeg') {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('无效的 JPEG 文件');
    const result = new Uint8Array(bytes);
    let position = 2;
    while (position + 4 <= result.length && result[position] === 0xff) {
      const marker = result[position + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = (result[position + 2] << 8) | result[position + 3];
      if (length < 2 || position + length + 2 > result.length) break;
      if (
        marker === 0xe0 &&
        length >= 16 &&
        String.fromCharCode(...result.slice(position + 4, position + 9)) === 'JFIF\0'
      ) {
        result[position + 11] = 1;
        result[position + 12] = dpi >> 8;
        result[position + 13] = dpi & 255;
        result[position + 14] = dpi >> 8;
        result[position + 15] = dpi & 255;
        return result;
      }
      position += length + 2;
    }
    const header = new Uint8Array([
      255,
      224,
      0,
      16,
      74,
      70,
      73,
      70,
      0,
      1,
      2,
      1,
      dpi >> 8,
      dpi & 255,
      dpi >> 8,
      dpi & 255,
      0,
      0,
    ]);
    const output = new Uint8Array(bytes.length + header.length);
    output.set(bytes.slice(0, 2));
    output.set(header, 2);
    output.set(bytes.slice(2), 2 + header.length);
    return output;
  }
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error('无效的 PNG 文件');
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  const ppm = Math.round(dpi / 0.0254);
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts: Uint8Array[] = [bytes.slice(0, 8)];
  let pos = 8;
  let inserted = false;
  while (pos + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + pos, 4).getUint32(0);
    if (pos + length + 12 > bytes.length) throw new Error('PNG 数据不完整');
    const type = String.fromCharCode(...bytes.slice(pos + 4, pos + 8));
    if (type !== 'pHYs') parts.push(bytes.slice(pos, pos + length + 12));
    if (type === 'IHDR') {
      parts.push(chunk);
      inserted = true;
    }
    pos += length + 12;
  }
  if (!inserted || pos !== bytes.length) throw new Error('无效的 PNG 数据');
  const result = new Uint8Array(parts.reduce((sum, item) => sum + item.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
