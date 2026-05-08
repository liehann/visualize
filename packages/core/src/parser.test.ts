import { describe, expect, it } from 'vitest';
import { normalizeAttachmentPath, rollupRun } from './parser.js';
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

  it('falls back to leading-slash strip for unknown layouts', () => {
    expect(normalizeAttachmentPath('/foo/bar/baz.png')).toBe('foo/bar/baz.png');
  });

  it('does not crash on relative test-results paths', () => {
    // (Pre-1.40 Playwright JSON reporter could emit these.)
    expect(normalizeAttachmentPath('test-results/foo/video.webm')).toBe(
      'test-results/foo/video.webm',
    );
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
