import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { computeDiffMetric } from './diff_metrics.js';

function solidPng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx + 0] = rgba[0];
      png.data[idx + 1] = rgba[1];
      png.data[idx + 2] = rgba[2];
      png.data[idx + 3] = rgba[3];
    }
  }
  return PNG.sync.write(png);
}

function checkerboardPng(
  width: number,
  height: number,
  block: number,
  a: [number, number, number, number],
  b: [number, number, number, number],
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const useA = ((Math.floor(x / block) + Math.floor(y / block)) & 1) === 0;
      const c = useA ? a : b;
      const idx = (width * y + x) << 2;
      png.data[idx + 0] = c[0];
      png.data[idx + 1] = c[1];
      png.data[idx + 2] = c[2];
      png.data[idx + 3] = c[3];
    }
  }
  return PNG.sync.write(png);
}

describe('computeDiffMetric', () => {
  it('returns 0% when expected and actual are pixel-identical', async () => {
    const buf = solidPng(40, 30, [120, 80, 200, 255]);
    const result = await computeDiffMetric(buf, buf);
    expect(result).toEqual({ diffPixels: 0, diffPercent: 0 });
  });

  it('returns ~100% when actual fully differs from expected', async () => {
    const expected = solidPng(20, 20, [0, 0, 0, 255]);
    const actual = solidPng(20, 20, [255, 255, 255, 255]);
    const result = await computeDiffMetric(expected, actual);
    expect(result).not.toBeNull();
    expect(result!.diffPixels).toBe(400);
    expect(result!.diffPercent).toBe(100);
  });

  it('returns ~50% on a checkerboard inversion', async () => {
    // 16x16 with 4-pixel blocks alternating between two distinct colors
    // — half the pixels swap, so pixelmatch should flag ~50%.
    const expected = checkerboardPng(16, 16, 4,
      [255, 0, 0, 255],
      [0, 0, 255, 255],
    );
    const actual = checkerboardPng(16, 16, 4,
      [0, 0, 255, 255],
      [255, 0, 0, 255],
    );
    const result = await computeDiffMetric(expected, actual);
    expect(result).not.toBeNull();
    expect(result!.diffPercent).toBeCloseTo(100, 0);
    // (Inverting *every* tile means every pixel changed, not just half —
    // anchor the test on what pixelmatch actually sees.)
  });

  it('flags a single tile change as a small percentage', async () => {
    // Same colors, but actual flips a single 4x4 corner block.
    const expected = solidPng(20, 20, [128, 128, 128, 255]);
    const actualPng = new PNG({ width: 20, height: 20 });
    PNG.sync.read(expected).data.copy(actualPng.data);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const idx = (20 * y + x) << 2;
        actualPng.data[idx + 0] = 0;
        actualPng.data[idx + 1] = 0;
        actualPng.data[idx + 2] = 0;
        actualPng.data[idx + 3] = 255;
      }
    }
    const actual = PNG.sync.write(actualPng);
    const result = await computeDiffMetric(expected, actual);
    expect(result).not.toBeNull();
    expect(result!.diffPixels).toBe(16); // 4x4 block
    expect(result!.diffPercent).toBeCloseTo((16 / 400) * 100, 5);
  });

  it('returns 100% when dimensions differ instead of crashing', async () => {
    const expected = solidPng(10, 10, [0, 0, 0, 255]);
    const actual = solidPng(20, 10, [0, 0, 0, 255]);
    const result = await computeDiffMetric(expected, actual);
    expect(result).toEqual({ diffPixels: 200, diffPercent: 100 });
  });

  it('returns null on undecodable input', async () => {
    const result = await computeDiffMetric(
      Buffer.from('not a png'),
      Buffer.from('also not a png'),
    );
    expect(result).toBeNull();
  });
});
