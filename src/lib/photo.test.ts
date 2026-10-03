import { describe, expect, it } from 'vitest';
import { getPixelSize, getPrintLayout, getSourceQualitySize, mmToPx, PRESETS } from './photo';
import { crc32, embedDpi } from './dpi';

describe('physical dimensions', () => {
  it('converts standard one-inch at 300 DPI without floor bias', () => {
    expect(getPixelSize(25, 35, 300)).toEqual({ width: 295, height: 413 });
    expect(mmToPx(25.4, 600)).toBe(600);
  });
  it('supports fractional millimetres and rejects invalid values', () => {
    expect(getPixelSize(25.4, 50.8, 150)).toEqual({ width: 150, height: 300 });
    for (const bad of [0, -1, NaN, Infinity]) expect(() => getPixelSize(bad, 35, 300)).toThrow();
  });
  it('keeps all presets within one pixel of the physical target', () => {
    for (const item of PRESETS)
      for (const dpi of [150, 300, 600]) {
        const size = getPixelSize(item.widthMm, item.heightMm, dpi);
        expect(Math.abs((size.width / dpi) * 25.4 - item.widthMm)).toBeLessThan(25.4 / dpi);
        expect(Math.abs((size.height / dpi) * 25.4 - item.heightMm)).toBeLessThan(25.4 / dpi);
      }
  });
});

describe('source-quality output', () => {
  it('uses every effective source pixel without enlarging a matching portrait', () => {
    expect(getSourceQualitySize(4000, 5600, 25, 35)).toEqual({
      width: 4000,
      height: 5600,
      dpi: 4064,
    });
  });

  it('crops only the excess dimension for a different target aspect', () => {
    expect(getSourceQualitySize(6000, 4000, 25, 35)).toEqual({
      width: 2857,
      height: 4000,
      dpi: 2903,
    });
  });

  it('retains native sampling density while zooming and caps browser memory', () => {
    expect(getSourceQualitySize(3000, 4200, 25, 35, 2)).toEqual({
      width: 1500,
      height: 2100,
      dpi: 1524,
    });
    const large = getSourceQualitySize(6000, 6000, 25, 35, 0.5);
    expect(large.width * large.height).toBeLessThanOrEqual(40_000_000);
    expect(large.width / large.height).toBeCloseTo(25 / 35, 3);
  });

  it('rejects invalid source-quality inputs', () => {
    expect(() => getSourceQualitySize(0, 100, 25, 35)).toThrow();
    expect(() => getSourceQualitySize(100, 100, 25, 35, 0)).toThrow();
  });
});

describe('six-inch print layout', () => {
  it('uses real 6 × 4 inch paper and chooses the denser orientation', () => {
    const layout = getPrintLayout(295, 413, 300);
    expect([layout.width, layout.height]).toEqual([1800, 1200]);
    expect(layout.count).toBe(12);
    expect(layout.rotated).toBe(true);
  });
  it('leaves margins and gaps at every supported resolution', () => {
    for (const dpi of [150, 300, 600])
      for (const item of PRESETS) {
        const size = getPixelSize(item.widthMm, item.heightMm, dpi);
        const layout = getPrintLayout(size.width, size.height, dpi);
        expect(layout.count).toBeGreaterThan(0);
        for (const cell of layout.cells) {
          expect(cell.x).toBeGreaterThanOrEqual(layout.margin - 1);
          expect(cell.y).toBeGreaterThanOrEqual(layout.margin - 1);
          expect(cell.x + layout.cellWidth).toBeLessThanOrEqual(layout.width - layout.margin + 1);
          expect(cell.y + layout.cellHeight).toBeLessThanOrEqual(layout.height - layout.margin + 1);
        }
        for (let i = 0; i < layout.cells.length; i++)
          for (let j = i + 1; j < layout.cells.length; j++) {
            const a = layout.cells[i],
              b = layout.cells[j];
            expect(
              Math.abs(a.x - b.x) >= layout.cellWidth + layout.gap - 1 ||
                Math.abs(a.y - b.y) >= layout.cellHeight + layout.gap - 1,
            ).toBe(true);
          }
      }
  });
  it('returns zero cells when a photo cannot fit', () => {
    expect(getPrintLayout(2000, 2000, 300).count).toBe(0);
  });
});

describe('DPI metadata', () => {
  const png = new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  function pngChunks(bytes: Uint8Array) {
    const chunks: { type: string; data: Uint8Array; crc: number }[] = [];
    for (let p = 8; p + 12 <= bytes.length;) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + p, 4).getUint32(0);
      chunks.push({
        type: String.fromCharCode(...bytes.slice(p + 4, p + 8)),
        data: bytes.slice(p + 4, p + 8 + length),
        crc: new DataView(bytes.buffer, bytes.byteOffset + p + 8 + length, 4).getUint32(0),
      });
      p += length + 12;
    }
    return chunks;
  }
  it('writes one valid pHYs chunk before image data without changing image data', () => {
    const result = embedDpi(png, 'png', 300);
    const chunks = pngChunks(result);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    const physical = chunks[1];
    expect(new DataView(physical.data.buffer).getUint32(4)).toBe(11811);
    expect(new DataView(physical.data.buffer).getUint32(8)).toBe(11811);
    expect(physical.data[12]).toBe(1);
    expect(physical.crc).toBe(crc32(physical.data));
    expect(chunks[2].data).toEqual(pngChunks(png)[1].data);
  });
  it('replaces existing PNG density metadata rather than duplicating it', () => {
    const chunks = pngChunks(embedDpi(embedDpi(png, 'png', 300), 'png', 600));
    expect(chunks.filter((c) => c.type === 'pHYs')).toHaveLength(1);
    expect(new DataView(chunks[1].data.buffer).getUint32(4)).toBe(23622);
  });
  it('inserts JPEG JFIF metadata and then updates it in place', () => {
    const minimal = new Uint8Array([255, 216, 255, 217]);
    const result = embedDpi(minimal, 'jpeg', 300);
    expect(String.fromCharCode(...result.slice(6, 11))).toBe('JFIF\0');
    expect(result[13]).toBe(1);
    expect((result[14] << 8) | result[15]).toBe(300);
    const updated = embedDpi(result, 'jpeg', 600);
    expect(updated.length).toBe(result.length);
    expect((updated[14] << 8) | updated[15]).toBe(600);
    expect((updated[16] << 8) | updated[17]).toBe(600);
    expect(result[15]).toBe(44);
  });
  it('uses the standard CRC32 polynomial', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('rejects unsupported data and invalid density', () => {
    expect(() => embedDpi(new Uint8Array(3), 'png', 300)).toThrow();
    expect(() => embedDpi(new Uint8Array(3), 'jpeg', 300)).toThrow();
    expect(() => embedDpi(png, 'png', 0)).toThrow();
  });
});
