import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export type DiffMetric = {
  diffPixels: number;
  diffPercent: number;
};

/**
 * Pure-computation pixelmatch wrapper. Decodes two PNG byte buffers and
 * returns the count + percentage of pixels that differ.
 *
 * `null` is returned when either buffer fails to decode — callers decide
 * whether to log/skip. Mismatched dimensions deliberately return 100%
 * rather than `null`: a screenshot whose size shifted between baseline
 * and actual is a real, surfaceable change, not an opaque error.
 *
 * Threshold defaults to 0.2 — matches Playwright's default
 * `toHaveScreenshot()` threshold so the percentage we report aligns with
 * what tripped the test.
 */
export async function computeDiffMetric(
  expectedBytes: Uint8Array | Buffer,
  actualBytes: Uint8Array | Buffer,
  opts: { threshold?: number; includeAA?: boolean } = {},
): Promise<DiffMetric | null> {
  let expected: PNG;
  let actual: PNG;
  try {
    [expected, actual] = await Promise.all([
      decode(expectedBytes),
      decode(actualBytes),
    ]);
  } catch {
    return null;
  }

  if (expected.width !== actual.width || expected.height !== actual.height) {
    const maxArea = Math.max(
      expected.width * expected.height,
      actual.width * actual.height,
    );
    return { diffPixels: maxArea, diffPercent: 100 };
  }

  const { width, height } = expected;
  const totalPixels = width * height;
  if (totalPixels === 0) return { diffPixels: 0, diffPercent: 0 };

  const out = new PNG({ width, height });
  const diffPixels = pixelmatch(expected.data, actual.data, out.data, width, height, {
    threshold: opts.threshold ?? 0.2,
    includeAA: opts.includeAA ?? false,
  });
  const diffPercent = (diffPixels / totalPixels) * 100;
  return { diffPixels, diffPercent };
}

function decode(bytes: Uint8Array | Buffer): Promise<PNG> {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return new Promise<PNG>((resolve, reject) => {
    const png = new PNG();
    png.parse(buf, (err) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}
