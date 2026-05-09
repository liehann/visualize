import { describe, expect, it } from 'vitest';
import { extractMissingSnapshotNames } from './pending-baselines.js';

describe('extractMissingSnapshotNames', () => {
  it('extracts the basename without .png from a Playwright "writing actual" error', () => {
    const msg =
      "Error: A snapshot doesn't exist at /home/runner/work/repo/tests/e2e/__screenshots__/foo.spec.ts/dashboard-chromium-linux.png, writing actual.";
    expect(extractMissingSnapshotNames([msg])).toEqual([
      'dashboard-chromium-linux',
    ]);
  });

  it('handles the unicode apostrophe Playwright sometimes emits', () => {
    const msg =
      'Error: A snapshot doesn’t exist at /tmp/foo.png, writing actual.';
    expect(extractMissingSnapshotNames([msg])).toEqual(['foo']);
  });

  it('extracts multiple names from multiple messages, dedup’d', () => {
    const messages = [
      "A snapshot doesn't exist at /a/b/foo.png, writing actual.",
      "A snapshot doesn't exist at /a/c/foo.png, writing actual.", // same basename — dedup
      "A snapshot doesn't exist at /a/b/bar.png, writing actual.",
    ];
    expect(new Set(extractMissingSnapshotNames(messages))).toEqual(
      new Set(['foo', 'bar']),
    );
  });

  it('returns empty for messages without the pattern', () => {
    expect(
      extractMissingSnapshotNames([
        'expected.toBe(true) — value was false',
        'TimeoutError: 30000ms exceeded',
        null,
        undefined,
      ]),
    ).toEqual([]);
  });

  it('does not match path-less or non-png references', () => {
    expect(
      extractMissingSnapshotNames([
        "A snapshot doesn't exist at /tmp/foo.svg, writing actual.",
        "A snapshot doesn't exist at — , writing actual.",
      ]),
    ).toEqual([]);
  });
});
