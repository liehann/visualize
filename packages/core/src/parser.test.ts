import { describe, expect, it } from 'vitest';
import {
  classifySnapshot,
  flattenSpecs,
  normalizeAttachmentPath,
  rollupRun,
} from './parser.js';
import type { ParsedSpec } from './parser.js';
import type { PlaywrightReport } from './types.js';

describe('normalizeAttachmentPath', () => {
  it('keeps already-relative HTML reporter paths unchanged', () => {
    expect(normalizeAttachmentPath('data/abcdef.png')).toBe('data/abcdef.png');
  });

  it('strips host prefix from absolute test-results paths (Linux runner)', () => {
    expect(
      normalizeAttachmentPath(
        '/Users/runner/work/visualize/visualize/test-results/sign-in/screenshot.png',
      ),
    ).toBe('test-results/sign-in/screenshot.png');
  });

  it('strips host prefix from absolute data paths', () => {
    expect(
      normalizeAttachmentPath(
        '/home/runner/work/visualize/visualize/playwright-report/data/abc.zip',
      ),
    ).toBe('data/abc.zip');
  });

  it('handles Windows-style host paths', () => {
    expect(
      normalizeAttachmentPath(
        'C:/Users/runner/test-results/spec/video.webm',
      ),
    ).toBe('test-results/spec/video.webm');
  });

  it('returns null for absolute paths with no anchor (info-leak guard)', () => {
    // Without this guard, an unrecognized absolute path got `replace(/^\//,'')`
    // applied and the resulting host-path was joined into the bundle URL
    // (e.g. /api/files/runs/<id>/home/runner/work/...). That's an info leak
    // and the file wouldn't resolve on disk anyway.
    expect(normalizeAttachmentPath('/foo/bar/baz.png')).toBeNull();
    expect(
      normalizeAttachmentPath('/home/runner/work/repo/custom-out/foo.png'),
    ).toBeNull();
    expect(normalizeAttachmentPath('C:\\Users\\runner\\custom\\foo.png')).toBeNull();
  });

  it('keeps relative non-anchored paths as-is', () => {
    // (Pre-1.40 Playwright JSON reporter could emit these.)
    expect(normalizeAttachmentPath('test-results/foo/video.webm')).toBe(
      'test-results/foo/video.webm',
    );
    expect(normalizeAttachmentPath('custom/dir/file.png')).toBe(
      'custom/dir/file.png',
    );
  });
});

describe('classifySnapshot', () => {
  it('classifies the drift triplet (no extension)', () => {
    expect(classifySnapshot({ name: 'sign-in-actual' })).toEqual({
      snapshotKind: 'actual',
      snapshotName: 'sign-in',
    });
    expect(classifySnapshot({ name: 'sign-in-expected' })).toEqual({
      snapshotKind: 'expected',
      snapshotName: 'sign-in',
    });
    expect(classifySnapshot({ name: 'sign-in-diff' })).toEqual({
      snapshotKind: 'diff',
      snapshotName: 'sign-in',
    });
  });

  it('classifies missing-baseline actuals (with .png extension)', () => {
    // Playwright emits "<name>-actual.png" the first time a snapshot test
    // runs without a baseline ("A snapshot doesn't exist at ..., writing
    // actual."). Without classifying these as snapshots, the viewer's
    // approve UI never renders for first-time snapshots — you'd have to
    // seed the baseline with `playwright --update-snapshots` and commit.
    expect(classifySnapshot({ name: 'new-project-actual.png' })).toEqual({
      snapshotKind: 'actual',
      snapshotName: 'new-project',
    });
  });

  it('preserves the snapshot name through hyphens', () => {
    expect(classifySnapshot({ name: 'home-empty-state-diff' })).toEqual({
      snapshotKind: 'diff',
      snapshotName: 'home-empty-state',
    });
  });

  it('does not match unrelated attachments', () => {
    expect(classifySnapshot({ name: 'screenshot' })).toEqual({});
    expect(classifySnapshot({ name: 'video' })).toEqual({});
    expect(classifySnapshot({ name: 'trace' })).toEqual({});
    expect(classifySnapshot({ name: 'error-context' })).toEqual({});
  });
});

describe('rollupRun', () => {
  function spec(status: ParsedSpec['status'], durationMs = 0): ParsedSpec {
    return {
      titlePath: 't',
      title: 't',
      file: 'f.spec.ts',
      status,
      durationMs,
      results: [],
    };
  }

  it('any failed -> failed', () => {
    expect(
      rollupRun([spec('passed'), spec('failed'), spec('passed')]).status,
    ).toBe('failed');
  });

  it('flaky without failures -> flaky', () => {
    expect(rollupRun([spec('passed'), spec('flaky')]).status).toBe('flaky');
  });

  it('all passed -> passed', () => {
    expect(rollupRun([spec('passed'), spec('expected')]).status).toBe('passed');
  });

  it('counts each bucket', () => {
    const r = rollupRun([
      spec('passed'),
      spec('expected'),
      spec('failed'),
      spec('flaky'),
      spec('skipped'),
      spec('timedOut'),
    ]);
    expect(r.totalTests).toBe(6);
    expect(r.passedTests).toBe(2); // passed + expected
    expect(r.failedTests).toBe(2); // failed + timedOut
    expect(r.flakyTests).toBe(1);
    expect(r.skippedTests).toBe(1);
  });

  it('sums durations', () => {
    const r = rollupRun([spec('passed', 100), spec('passed', 250)]);
    expect(r.durationMs).toBe(350);
  });
});

describe('flattenSpecs — attachment path/body fallback', () => {
  /**
   * Replicates the kuruvu_track screenshot-diff failure mode that
   * silently lost evidence in production: Playwright emits the
   * actual/expected/diff triplet with both an absolute `path` (under a
   * non-default `outputDir`) AND an inline base64 `body`. Before the
   * fallback, an unanchorable `path` made `attachmentToParsed` return
   * null and the inline body was never inspected — the test failure
   * was visible (error message persisted) but the diff images
   * vanished from the upload, so the user couldn't approve the diff.
   */
  function makeReport(attachment: {
    name: string;
    path?: string;
    body?: string;
    contentType?: string;
  }): PlaywrightReport {
    return {
      suites: [
        {
          title: 'golden.spec.ts',
          file: 'golden.spec.ts',
          column: 0,
          line: 0,
          specs: [
            {
              title: 'athletes-grid',
              file: 'golden.spec.ts',
              line: 70,
              column: 7,
              tests: [
                {
                  projectName: 'chromium',
                  expectedStatus: 'passed',
                  status: 'unexpected',
                  results: [
                    {
                      retry: 0,
                      duration: 8000,
                      status: 'failed',
                      attachments: [attachment],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as PlaywrightReport;
  }

  it('keeps an attachment whose path was already under test-results/', () => {
    const report = makeReport({
      name: 'athletes-grid-actual',
      path: '/home/runner/work/foo/foo/test-results/spec/athletes-grid-actual.png',
      contentType: 'image/png',
    });
    const specs = flattenSpecs(report, 'bundle-rel');
    const att = specs[0]!.results[0]!.attachments[0]!;
    expect(att.snapshotKind).toBe('actual');
    expect(att.snapshotName).toBe('athletes-grid');
    expect(att.storagePath).toContain('test-results/spec/athletes-grid-actual.png');
    expect(att.inlineBody).toBeUndefined();
  });

  it('falls back to inline body when an absolute path cannot be normalized', () => {
    // This is the bug class: a custom outputDir like ".test-output/"
    // means the path doesn't anchor on test-results/ or data/. Older
    // parser code returned null here and dropped the attachment, even
    // though Playwright also sent the bytes as `body`.
    const report = makeReport({
      name: 'athletes-grid-actual',
      path: '/home/runner/work/foo/foo/.test-output/spec/athletes-grid-actual.png',
      body: 'aGVsbG8=', // 'hello' base64
      contentType: 'image/png',
    });
    const specs = flattenSpecs(report, 'bundle-rel');
    const atts = specs[0]!.results[0]!.attachments;
    expect(atts).toHaveLength(1);
    expect(atts[0]!.snapshotKind).toBe('actual');
    expect(atts[0]!.inlineBody).toBe('aGVsbG8=');
    // Storage path is synthesized under bundle-rel/inline/ for body-only
    expect(atts[0]!.storagePath).toContain('inline/');
  });

  it('drops the attachment only when there is genuinely no path AND no body', () => {
    const report = makeReport({
      name: 'athletes-grid-actual',
      path: '/home/runner/work/foo/foo/.test-output/spec/athletes-grid-actual.png',
      contentType: 'image/png',
      // No body. Path can't be normalized. Truly nothing to store.
    });
    const specs = flattenSpecs(report, 'bundle-rel');
    expect(specs[0]!.results[0]!.attachments).toEqual([]);
  });

  it('still uses inline body when no path is present (existing behaviour)', () => {
    const report = makeReport({
      name: 'athletes-grid-diff',
      body: 'aGVsbG8=',
      contentType: 'image/png',
    });
    const specs = flattenSpecs(report, 'bundle-rel');
    const att = specs[0]!.results[0]!.attachments[0]!;
    expect(att.inlineBody).toBe('aGVsbG8=');
    expect(att.snapshotKind).toBe('diff');
  });
});
