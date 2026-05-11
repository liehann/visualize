import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { PrismaClient } from '@prisma/client';
import { loadReport, flattenSpecs, rollupRun } from '@visualize/core/parser';
import { computeDiffMetric } from '@visualize/core/diff_metrics';

/**
 * Narrative tour of the PR-feedback-loop features against the REAL viewer
 * routes: run page, test detail page, lightbox, bulk-approve sheet, and
 * run-vs-run compare. The recorded video doubles as a single-take demo.
 *
 * Setup seeds two runs from a real-shaped Playwright report (the same
 * `__fixtures__/playwright-1.49` bundle the parser unit tests run against),
 * exercising the actual `loadReport` → `flattenSpecs` → Prisma persistence
 * path. The PNGs in the fixture are zero-byte placeholders, so the seed
 * overwrites them with procedurally-generated content; that way the
 * lightbox / slider / pixelmatch all have meaningful images to chew on.
 *
 * The seed leaves a single project ("tour-fixture") in the DB while the
 * tour runs and tears everything down in afterAll, so the empty-state
 * tests in home.spec.ts (which run after this file alphabetically) still
 * see a freshly-empty database.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_SRC = path.resolve(
  __dirname,
  '../../../packages/core/__fixtures__/playwright-1.49',
);
const SIGN_IN_DIR = 'test-results/sign-in-screenshot-test-chromium';
const PROJECT_SLUG = 'tour-fixture';

const prisma = new PrismaClient();

const baselineRunId = randomUUID();
const prRunId = randomUUID();

let DATA_DIR = '';

test.describe.serial('PR feedback loop — real run, real lightbox, real compare', () => {
  test.beforeAll(async () => {
    DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR ?? './data');
    process.env.DATA_DIR = DATA_DIR;

    await wipeProjectSlug(PROJECT_SLUG);

    // "main" run: actual == expected ⇒ pixelmatch finds no diff, but the
    // fixture still carries a snapshot triplet so the run-detail page has
    // a baseline to compare against in the run-vs-run view.
    await seedRun(baselineRunId, {
      branch: 'main',
      prNumber: null,
      commitSha: 'a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0',
      expectedRgb: [70, 90, 130],
      actualRgb: [70, 90, 130],
      noisyActual: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 60),
    });

    // "PR" run: actual is noisy + shifted, so the diff% badge is non-trivial
    // and the bulk-approve banner surfaces a pending change.
    await seedRun(prRunId, {
      branch: 'feat/redesign-sign-in',
      prNumber: 142,
      commitSha: 'b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1',
      expectedRgb: [70, 90, 130],
      actualRgb: [60, 80, 140],
      noisyActual: true,
      createdAt: new Date(),
    });
  });

  test.afterAll(async () => {
    await wipeProjectSlug(PROJECT_SLUG);
    await prisma.$disconnect();
  });

  test('triage flow: run page → lightbox → bulk approve → compare', async ({
    page,
  }) => {
    // 1. Land on the PR run. Bulk-approve banner is visible because the
    //    sign-in snapshot has a pending triplet with no approved baseline.
    await page.goto(`/runs/${prRunId}`);
    await expect(
      page.getByRole('heading', { name: 'tour-fixture', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('feat/redesign-sign-in')).toBeVisible();
    await expect(page.getByText('PR #142')).toBeVisible();
    await expect(
      page.getByText(/1 visual change pending review/i),
    ).toBeVisible();
    await page.waitForTimeout(400);

    // 2. Click into the failing test (real test detail page).
    await page
      .getByRole('link', { name: /sign-in page screenshot/i })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: /sign-in page screenshot/i }),
    ).toBeVisible();
    // Diff gallery renders the sign-in triplet; diff% badge present because
    // the seed ran pixelmatch against expected + actual.
    await expect(page.locator('img[alt="actual"]').first()).toBeVisible();
    await expect(page.locator('img[alt="expected"]').first()).toBeVisible();
    await expect(page.locator('img[alt="diff"]').first()).toBeVisible();
    await page.waitForTimeout(300);

    // 3. Open the lightbox by clicking the "actual" thumbnail. Default view
    //    for a triplet with both expected + actual is the slider.
    await page.locator('img[alt="actual"]').first().click();
    const dialog = page.getByRole('dialog', { name: 'Snapshot diff' });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400);

    // 4. Drag the slider divider to ~30%.
    const stage = dialog.locator('div[style*="cursor: ew-resize"]').first();
    const box = await stage.boundingBox();
    if (!box) throw new Error('slider stage missing bounding box');
    const cy = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, cy);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, cy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const clip = await dialog
      .locator('[style*="clip-path"]')
      .first()
      .evaluate((el) => (el as HTMLElement).style.clipPath);
    expect(clip).toMatch(/[23][0-9](?:\.\d+)?%/);

    // 5. Cycle view modes: 1=side, 3=onion, 4=diff.
    await page.keyboard.press('1');
    await page.waitForTimeout(250);
    await expect(dialog.getByText('expected')).toBeVisible();
    await expect(dialog.getByText('actual')).toBeVisible();

    await page.keyboard.press('3');
    await page.waitForTimeout(250);

    await page.keyboard.press('4');
    await page.waitForTimeout(250);
    // DiffStage shows a "100%" zoom indicator by default.
    await expect(dialog.getByText('100%')).toBeVisible();

    // 6. Wheel-zoom on the diff stage so the screencast picks up the gesture.
    const zoomSurface = dialog
      .locator('div[style*="cursor: grab"], div[style*="cursor: grabbing"]')
      .first();
    const zbox = await zoomSurface.boundingBox();
    if (zbox) {
      await page.mouse.move(zbox.x + zbox.width / 2, zbox.y + zbox.height / 2);
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(80);
      }
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // 7. Back to the run page → open the bulk-approve sheet.
    await page.getByRole('link', { name: /back to run/i }).click();
    await expect(
      page.getByText(/1 visual change pending review/i),
    ).toBeVisible();
    await page.getByRole('button', { name: /approve all 1/i }).click();
    const sheet = page.getByRole('heading', {
      name: /approve 1 visual change/i,
    });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(600);
    // Cancel rather than approve — approval would mutate Baseline state
    // we don't need to touch, and it'd hide the banner on a re-render.
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(sheet).toBeHidden();

    // 8. Compare with the baseline run.
    await page.getByRole('link', { name: /^compare$/i }).click();
    await expect(
      page.getByRole('heading', { name: /compare with another run/i }),
    ).toBeVisible();
    // The picker has exactly one candidate (the baseline run on `main`).
    await page
      .locator(`a[href="/runs/${prRunId}/compare/${baselineRunId}"]`)
      .click();
    await expect(
      page.getByRole('heading', { name: /comparing runs/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /^visual changes$/i }),
    ).toBeVisible();
    // The sign-in snapshot's actual PNG differs between the two runs.
    await expect(page.getByText('sign-in').first()).toBeVisible();
    await page.waitForTimeout(500);
  });
});

type SeedOpts = {
  branch: string;
  prNumber: number | null;
  commitSha: string;
  expectedRgb: [number, number, number];
  actualRgb: [number, number, number];
  noisyActual: boolean;
  createdAt: Date;
};

async function seedRun(runId: string, opts: SeedOpts): Promise<void> {
  const bundleRel = `runs/${runId}`;
  const bundleAbs = path.join(DATA_DIR, bundleRel);

  await fs.rm(bundleAbs, { recursive: true, force: true });
  await fs.cp(FIXTURE_SRC, bundleAbs, { recursive: true });
  await writePng(
    path.join(bundleAbs, SIGN_IN_DIR, 'sign-in-expected.png'),
    opts.expectedRgb,
    false,
  );
  await writePng(
    path.join(bundleAbs, SIGN_IN_DIR, 'sign-in-actual.png'),
    opts.actualRgb,
    opts.noisyActual,
  );
  await writePng(
    path.join(bundleAbs, SIGN_IN_DIR, 'sign-in-diff.png'),
    [255, 0, 200],
    false,
  );

  const report = await loadReport(bundleRel);
  const specs = flattenSpecs(report, bundleRel);
  const rollup = rollupRun(specs);

  const project = await prisma.project.upsert({
    where: { slug: PROJECT_SLUG },
    update: {},
    create: { slug: PROJECT_SLUG, name: 'tour-fixture' },
  });

  await prisma.$transaction(async (tx) => {
    await tx.run.create({
      data: {
        id: runId,
        projectId: project.id,
        commitSha: opts.commitSha,
        branch: opts.branch,
        prNumber: opts.prNumber,
        ciProvider: 'github',
        platform: 'linux',
        status: rollup.status,
        createdAt: opts.createdAt,
        finishedAt: opts.createdAt,
        durationMs: rollup.durationMs,
        totalTests: rollup.totalTests,
        passedTests: rollup.passedTests,
        failedTests: rollup.failedTests,
        flakyTests: rollup.flakyTests,
        skippedTests: rollup.skippedTests,
        storagePath: `${bundleRel}/`,
      },
    });
    for (const spec of specs) {
      await tx.testCase.create({
        data: {
          runId,
          titlePath: spec.titlePath,
          title: spec.title,
          file: spec.file,
          line: spec.line,
          column: spec.column,
          projectName: spec.projectName,
          status: spec.status,
          expectedStatus: spec.expectedStatus,
          durationMs: spec.durationMs,
          results: {
            create: spec.results.map((r) => ({
              retry: r.retry,
              status: r.status,
              durationMs: r.durationMs,
              startedAt: r.startedAt,
              workerIndex: r.workerIndex,
              errorMessage: r.errorMessage,
              errorStack: r.errorStack,
              errorSnippet: r.errorSnippet,
              stdout: r.stdout,
              stderr: r.stderr,
              attachments: {
                create: r.attachments.map((a) => ({
                  name: a.name,
                  contentType: a.contentType,
                  storagePath: a.storagePath,
                  sizeBytes: a.sizeBytes,
                  kind: a.kind,
                  snapshotKind: a.snapshotKind,
                  snapshotName: a.snapshotName,
                  snapshotPath: a.snapshotPath,
                })),
              },
            })),
          },
        },
      });
    }
  });

  await stampDiffMetric(runId, 'sign-in');
}

async function stampDiffMetric(
  runId: string,
  snapshotName: string,
): Promise<void> {
  const atts = await prisma.attachment.findMany({
    where: { snapshotName, testResult: { testCase: { runId } } },
  });
  const actual = atts.find((a) => a.snapshotKind === 'actual');
  const expected = atts.find((a) => a.snapshotKind === 'expected');
  const diff = atts.find((a) => a.snapshotKind === 'diff');
  if (!actual || !expected || !diff) return;
  const [expectedBytes, actualBytes] = await Promise.all([
    fs.readFile(path.resolve(DATA_DIR, expected.storagePath)),
    fs.readFile(path.resolve(DATA_DIR, actual.storagePath)),
  ]);
  const metric = await computeDiffMetric(expectedBytes, actualBytes);
  if (!metric) return;
  await prisma.attachment.update({
    where: { id: diff.id },
    data: { diffPixels: metric.diffPixels, diffPercent: metric.diffPercent },
  });
}

async function writePng(
  absPath: string,
  rgb: [number, number, number],
  noisy: boolean,
): Promise<void> {
  const w = 400;
  const h = 240;
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      const n = noisy ? Math.floor(Math.random() * 40) - 20 : 0;
      png.data[i] = clamp(rgb[0] + n);
      png.data[i + 1] = clamp(rgb[1] + n);
      png.data[i + 2] = clamp(rgb[2] + n);
      png.data[i + 3] = 255;
    }
  }
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, PNG.sync.write(png));
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

async function wipeProjectSlug(slug: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return;
  const runs = await prisma.run.findMany({
    where: { projectId: project.id },
    select: { storagePath: true },
  });
  await prisma.baseline.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });
  for (const r of runs) {
    if (!r.storagePath) continue;
    const abs = path.resolve(DATA_DIR, r.storagePath);
    await fs.rm(abs, { recursive: true, force: true });
  }
}
