#!/usr/bin/env tsx
/**
 * Additive seed: one run with MANY pending visual diffs across several tests,
 * each backed by an approved golden Baseline so the run-wide review shows
 * before/after (slider + difference work) and the "review N" step-through
 * walks across tests. Does NOT wipe other data.
 *
 *   DATA_DIR=/abs/path tsx scripts/seed-review-demo.ts
 */
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import 'dotenv/config';

const prisma = new PrismaClient();
const DATA_DIR = process.env.DATA_DIR || path.resolve('./data');

async function writePng(
  relPath: string,
  rgb: [number, number, number],
  opts: { noisy?: boolean; band?: [number, number, number] } = {},
  width = 900,
  height = 560,
): Promise<{ rel: string; size: number }> {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      // A horizontal band in the middle third paints `band` color (used to
      // make the diff image look like a real pixelmatch highlight).
      const inBand = opts.band && y > height / 3 && y < (2 * height) / 3;
      const c = inBand ? opts.band! : rgb;
      const noise = opts.noisy && !inBand ? Math.random() * 36 - 18 : 0;
      png.data[idx] = Math.max(0, Math.min(255, c[0] + noise));
      png.data[idx + 1] = Math.max(0, Math.min(255, c[1] + noise));
      png.data[idx + 2] = Math.max(0, Math.min(255, c[2] + noise));
      png.data[idx + 3] = 255;
    }
  }
  const buf = PNG.sync.write(png);
  const abs = path.join(DATA_DIR, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  return { rel: relPath, size: buf.length };
}

type Spec = {
  name: string;
  title: string;
  base: [number, number, number];
  diffPercent: number;
  diffPixels: number;
};

const SPECS: Spec[] = [
  { name: 'home-hero', title: 'home > hero section matches snapshot', base: [38, 70, 120], diffPercent: 14.8, diffPixels: 74_500 },
  { name: 'pricing-table', title: 'pricing > table matches snapshot', base: [28, 32, 44], diffPercent: 6.1, diffPixels: 30_700 },
  { name: 'nav-bar', title: 'navigation > top nav matches snapshot', base: [18, 20, 28], diffPercent: 2.3, diffPixels: 11_600 },
  { name: 'settings-form', title: 'settings > profile form matches snapshot', base: [22, 40, 36], diffPercent: 0.42, diffPixels: 2_100 },
  { name: 'footer', title: 'footer > links matches snapshot', base: [16, 16, 22], diffPercent: 0.04, diffPixels: 200 },
];

async function main() {
  console.log('Seeding review-demo into', DATA_DIR);

  const project = await prisma.project.upsert({
    where: { slug: 'review-demo' },
    update: {},
    create: { slug: 'review-demo', name: 'Review demo (multi-diff)' },
  });

  // Fresh run each invocation; clear any prior review-demo runs first.
  await prisma.run.deleteMany({ where: { projectId: project.id } });

  const runId = `run_reviewdemo`;
  const bundle = `runs/${runId}/`;

  const run = await prisma.run.create({
    data: {
      id: runId,
      projectId: project.id,
      status: 'failed',
      branch: 'feat/visual-refresh',
      prNumber: 207,
      commitSha: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3',
      ciProvider: 'github',
      ciRunUrl: 'https://github.com/liehann/phloots/actions/runs/2207',
      storagePath: bundle,
      createdAt: new Date(),
      startedAt: new Date(Date.now() - 1000 * 60 * 9),
      finishedAt: new Date(Date.now() - 1000 * 60 * 2),
      durationMs: 7 * 60 * 1000,
      totalTests: SPECS.length + 6,
      passedTests: 6,
      failedTests: SPECS.length,
      flakyTests: 0,
      skippedTests: 0,
    },
  });

  for (const spec of SPECS) {
    const expected = await writePng(`${bundle}data/${spec.name}-expected.png`, spec.base);
    const actual = await writePng(`${bundle}data/${spec.name}-actual.png`, spec.base, {
      noisy: true,
      band: [80, 130, 220],
    });
    const diff = await writePng(`${bundle}data/${spec.name}-diff.png`, [10, 10, 12], {
      band: [255, 60, 200],
    });

    // Approved golden so the run-wide review backfills `expected` (before/after).
    await prisma.baseline.upsert({
      where: { projectId_path: { projectId: project.id, path: `snapshots/${spec.name}.png` } },
      update: { storagePath: expected.rel, sizeBytes: expected.size, approvedAt: new Date() },
      create: {
        projectId: project.id,
        path: `snapshots/${spec.name}.png`,
        name: spec.name,
        storagePath: expected.rel,
        sizeBytes: expected.size,
        width: 900,
        height: 560,
        approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        runId: run.id,
        titlePath: spec.title,
        title: spec.title.split(' > ').slice(-1)[0]!,
        file: `tests/${spec.title.split(' > ')[0]!}.spec.ts`,
        line: 20,
        projectName: 'chromium',
        status: 'failed',
        durationMs: 3_000,
      },
    });
    const tr = await prisma.testResult.create({
      data: {
        testCaseId: tc.id,
        retry: 0,
        status: 'failed',
        durationMs: 3_000,
        errorMessage: `Error: expect(page).toHaveScreenshot('${spec.name}.png')\n\n  ${spec.diffPixels} pixels (${spec.diffPercent}% of all image pixels) are different.`,
      },
    });
    await prisma.attachment.createMany({
      data: [
        { testResultId: tr.id, name: `${spec.name}-expected`, contentType: 'image/png', kind: 'screenshot', snapshotKind: 'expected', snapshotName: spec.name, storagePath: expected.rel, sizeBytes: expected.size },
        { testResultId: tr.id, name: `${spec.name}-actual`, contentType: 'image/png', kind: 'screenshot', snapshotKind: 'actual', snapshotName: spec.name, storagePath: actual.rel, sizeBytes: actual.size },
        { testResultId: tr.id, name: `${spec.name}-diff`, contentType: 'image/png', kind: 'screenshot', snapshotKind: 'diff', snapshotName: spec.name, storagePath: diff.rel, sizeBytes: diff.size, diffPixels: spec.diffPixels, diffPercent: spec.diffPercent },
      ],
    });
  }

  console.log(`Seed complete: project "review-demo", run ${runId} with ${SPECS.length} pending diffs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
