import { describe, expect, it } from 'vitest';
import { classifySnapshot, normalizeAttachmentPath, rollupRun } from './parser.js';
import type { ParsedSpec } from './parser.js';

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
