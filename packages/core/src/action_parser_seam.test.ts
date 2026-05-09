import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { flattenSpecs, loadReport } from './parser.js';

/**
 * Integration test for the seam between the GitHub Action's bundle
 * step and the ingest's parser. Today's kuruvu_track bug fell through
 * exactly here:
 *
 *   - kuruvu_track configures `outputDir: tests/e2e/artifacts/test-output`
 *   - Playwright's JSON reporter writes attachment paths as absolute
 *     CI-runner paths under that outputDir
 *   - Action canonicalizes the dir into the bundle as `test-results/`
 *     but DIDN'T rewrite report.json (pre-fix)
 *   - Parser anchors on `/test-results/`, doesn't match, drops every
 *     screenshot triplet attachment silently
 *
 * Net: bug. The action fix sed-rewrites the absolute outputDir prefix
 * to `test-results/` so bundle layout and report.json agree. This test
 * runs the *exact same sed* the production action runs, then runs the
 * production parser on the result, and asserts attachments survive
 * end-to-end.
 *
 * If the action drifts from this sed pattern, or the parser regresses
 * on the rewritten paths, this test fails on the contributing PR.
 */
describe('action → parser seam (custom outputDir round-trip)', () => {
  let workspace: string;
  let bundleRoot: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'visualize-seam-'));
    // Match what a real CI workspace looks like: outputDir is a
    // non-default nested path, mimicking kuruvu_track's
    // tests/e2e/artifacts/test-output/.
    const reportDir = path.join(workspace, 'tests/e2e/artifacts/visualize-report');
    const outputDir = path.join(workspace, 'tests/e2e/artifacts/test-output');
    const testCaseDir = path.join(outputDir, 'tc-athletes-grid-chromium');
    await fs.mkdir(reportDir, { recursive: true });
    await fs.mkdir(testCaseDir, { recursive: true });

    // Tiny but valid PNG bytes (1×1 transparent).
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c620001000005000100000d0a2db4000000000049454e44ae426082',
      'hex',
    );
    await fs.writeFile(path.join(testCaseDir, 'athletes-grid-actual.png'), png);
    await fs.writeFile(path.join(testCaseDir, 'athletes-grid-expected.png'), png);
    await fs.writeFile(path.join(testCaseDir, 'athletes-grid-diff.png'), png);

    // Synthetic report.json — the shape Playwright's JSON reporter
    // would emit when toHaveScreenshot fails on a diff. Absolute paths
    // pointing under the consumer's non-default outputDir.
    const report = {
      config: {},
      stats: {},
      suites: [
        {
          title: 'golden.spec.ts',
          file: 'golden.spec.ts',
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
                      attachments: [
                        {
                          name: 'athletes-grid-actual',
                          path: path.join(testCaseDir, 'athletes-grid-actual.png'),
                          contentType: 'image/png',
                        },
                        {
                          name: 'athletes-grid-expected',
                          path: path.join(testCaseDir, 'athletes-grid-expected.png'),
                          contentType: 'image/png',
                        },
                        {
                          name: 'athletes-grid-diff',
                          path: path.join(testCaseDir, 'athletes-grid-diff.png'),
                          contentType: 'image/png',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report));

    // Replay the action's bundling logic. Keep this mirroring the
    // bash in action.yml's "Upload Playwright report" step — if the
    // action drifts, this test asserts the consequence.
    bundleRoot = path.join(workspace, 'staging');
    await fs.mkdir(bundleRoot);
    // cp -R "$REPORT_DIR/." "$STAGING/"
    execFileSync('cp', ['-R', `${reportDir}/.`, bundleRoot]);
    // cp -R "$TEST_RESULTS_DIR" "$STAGING/test-results"
    execFileSync('cp', ['-R', outputDir, path.join(bundleRoot, 'test-results')]);
    // sed -i "s|${ABS_TEST_RESULTS}/|test-results/|g" report.json
    const reportPath = path.join(bundleRoot, 'report.json');
    const sedArgs = process.platform === 'darwin'
      ? ['-i', '', `s|${outputDir}/|test-results/|g`, reportPath]
      : ['-i', `s|${outputDir}/|test-results/|g`, reportPath];
    execFileSync('sed', sedArgs);
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('REGRESSION GUARD: without the action sed rewrite, the parser silently drops the screenshot triplet', async () => {
    // This is the smoking gun for today's bug. Skip the sed step
    // (re-write report.json with original absolute paths) and verify
    // the parser drops every attachment. Locking it in so a future
    // change that accidentally removes the action's rewrite step is
    // caught by *this* test, not by a user complaint.
    const reportPath = path.join(bundleRoot, 'report.json');
    const outputDir = path.join(workspace, 'tests/e2e/artifacts/test-output');
    const testCaseDir = path.join(outputDir, 'tc-athletes-grid-chromium');
    const original = {
      config: {},
      stats: {},
      suites: [
        {
          title: 'golden.spec.ts',
          file: 'golden.spec.ts',
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
                      attachments: [
                        {
                          name: 'athletes-grid-actual',
                          path: path.join(testCaseDir, 'athletes-grid-actual.png'),
                          contentType: 'image/png',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    await fs.writeFile(reportPath, JSON.stringify(original));

    process.env.DATA_DIR = workspace;
    const report = await loadReport('staging');
    const specs = flattenSpecs(report, 'staging');
    // Without the rewrite: zero attachments survive. This is the
    // observable shape of the kuruvu_track bug.
    expect(specs[0]!.results[0]!.attachments).toEqual([]);
  });

  it('the action sed rewrite produces a report.json the parser can resolve', async () => {
    // Step 1: confirm the sed rewrite actually transformed the paths.
    const after = JSON.parse(
      await fs.readFile(path.join(bundleRoot, 'report.json'), 'utf8'),
    );
    const attachments =
      after.suites[0].specs[0].tests[0].results[0].attachments;
    for (const a of attachments) {
      expect(a.path).toMatch(/^test-results\/.*\.png$/);
      // Crucially: no leftover absolute-path prefix from the consumer's
      // outputDir. If we miss the rewrite for any prefix, this fails.
      expect(a.path).not.toContain('/tests/e2e/artifacts/test-output/');
    }

    // Step 2: run the production parser. DATA_DIR is the parent of
    // bundleRoot since loadReport joins on the segment we pass.
    process.env.DATA_DIR = workspace;
    const report = await loadReport('staging');
    const specs = flattenSpecs(report, 'staging');
    expect(specs).toHaveLength(1);

    const parsed = specs[0]!.results[0]!.attachments;
    // All three triplet members made it through.
    expect(parsed).toHaveLength(3);
    const kinds = parsed.map((a) => a.snapshotKind).sort();
    expect(kinds).toEqual(['actual', 'diff', 'expected']);

    // Storage paths point inside the bundle, no leaked absolute prefix.
    for (const a of parsed) {
      expect(a.storagePath).toMatch(/^staging\/test-results\/.*\.png$/);
      // The file actually exists on disk (loadable).
      const abs = path.join(workspace, a.storagePath);
      await expect(fs.access(abs)).resolves.toBeUndefined();
    }
  });
});
