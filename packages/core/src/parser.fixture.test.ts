import { describe, expect, it, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { flattenSpecs, loadReport, rollupRun } from './parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(__dirname, '..', '__fixtures__');

/**
 * Fixture-based parser test. The whole point of Visualize is to parse
 * Playwright reports correctly, so we exercise a real-shape report.json
 * (modeled on Playwright 1.49's JSON reporter output) committed to the
 * repo. Synthetic data has missed real bugs in the past — most recently
 * the absolute-path attachment regression.
 *
 * Each fixture lives at __fixtures__/<name>/ and contains:
 *   - report.json
 *   - data/         (HTML reporter's rewritten attachments, if any)
 *   - test-results/ (raw artifacts referenced by absolute path)
 */
describe('parser against playwright-1.49 fixture', () => {
  beforeAll(() => {
    process.env.DATA_DIR = fixturesRoot;
  });

  it('parses the fixture report.json', async () => {
    const report = await loadReport('playwright-1.49');
    expect(report.suites?.length).toBe(2);
  });

  it('flattens all specs', async () => {
    const report = await loadReport('playwright-1.49');
    const specs = flattenSpecs(report, 'playwright-1.49');
    expect(specs).toHaveLength(2);

    const [signIn, health] = specs;
    expect(signIn).toBeDefined();
    expect(health).toBeDefined();
    expect(signIn!.title).toBe('sign-in page screenshot');
    expect(signIn!.status).toBe('unexpected');
    expect(health!.title).toBe('home redirects to sign-in when unauthenticated');
    expect(health!.status).toBe('expected');
  });

  it('captures both attempts (retry) of the failing test', async () => {
    const report = await loadReport('playwright-1.49');
    const [signIn] = flattenSpecs(report, 'playwright-1.49');
    expect(signIn!.results).toHaveLength(2);
    expect(signIn!.results[0]!.retry).toBe(0);
    expect(signIn!.results[1]!.retry).toBe(1);
  });

  it('detects snapshot triplet on the first failure', async () => {
    const report = await loadReport('playwright-1.49');
    const [signIn] = flattenSpecs(report, 'playwright-1.49');
    const firstAttempt = signIn!.results[0]!;
    const triplet = firstAttempt.attachments.filter(
      (a) => a.snapshotKind && a.snapshotName === 'sign-in',
    );
    expect(triplet.map((a) => a.snapshotKind).sort()).toEqual([
      'actual',
      'diff',
      'expected',
    ]);
  });

  it('classifies kinds correctly', async () => {
    const report = await loadReport('playwright-1.49');
    const [signIn, health] = flattenSpecs(report, 'playwright-1.49');
    const kinds = signIn!.results[0]!.attachments.map((a) => a.kind).sort();
    // 3 screenshots + 1 video + 1 trace
    expect(kinds).toEqual(['screenshot', 'screenshot', 'screenshot', 'trace', 'video']);

    const healthKinds = health!.results[0]!.attachments.map((a) => a.kind).sort();
    expect(healthKinds).toEqual(['trace', 'video']);
  });

  it('resolves attachments to files that actually exist on disk', async () => {
    const report = await loadReport('playwright-1.49');
    const specs = flattenSpecs(report, 'playwright-1.49');
    for (const spec of specs) {
      for (const result of spec.results) {
        for (const attachment of result.attachments) {
          const abs = path.join(fixturesRoot, attachment.storagePath);
          // The file existing on disk is the whole point — this is the
          // regression test for the absolute-path bug.
          await expect(
            fs.access(abs),
            `attachment ${attachment.name} -> ${attachment.storagePath}`,
          ).resolves.toBeUndefined();
        }
      }
    }
  });

  it('rollup math on a mixed pass/fail run', async () => {
    const report = await loadReport('playwright-1.49');
    const specs = flattenSpecs(report, 'playwright-1.49');
    const r = rollupRun(specs);
    expect(r.totalTests).toBe(2);
    expect(r.passedTests).toBe(1); // health (`expected`)
    expect(r.failedTests).toBe(1); // sign-in (`unexpected`)
    expect(r.status).toBe('failed');
  });

  it('preserves error messages on failures', async () => {
    const report = await loadReport('playwright-1.49');
    const [signIn] = flattenSpecs(report, 'playwright-1.49');
    expect(signIn!.results[0]!.errorMessage).toMatch(/snapshot doesn't exist/);
  });

  it('includes data/-prefixed paths unchanged (HTML reporter convention)', async () => {
    const report = await loadReport('playwright-1.49');
    const [, health] = flattenSpecs(report, 'playwright-1.49');
    const trace = health!.results[0]!.attachments.find((a) => a.kind === 'trace');
    expect(trace?.storagePath).toBe(
      'playwright-1.49/data/abcdef0123456789abcdef0123456789.zip',
    );
  });
});
