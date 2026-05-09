/**
 * Seed a fixture Project + Run + snapshot triplet so the real-flow E2E
 * has something to render against. Mirrors the shape of what a real
 * ingest upload would produce — same Prisma rows, same on-disk PNG
 * layout, same pixelmatch-driven diffPercent.
 *
 * Idempotent: deletes the fixture project (cascades through runs +
 * tests + attachments + baselines) before recreating, so re-running the
 * test suite locally doesn't accumulate state.
 */
import { PrismaClient } from '@prisma/client';
import { PNG } from 'pngjs';
import { computeDiffMetric } from '@visualize/core/diff_metrics';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FIXTURE_PROJECT_SLUG = '_test_real_flow';

export type SeedResult = {
  projectSlug: string;
  runId: string;
  testId: string;
  snapshotName: string;
  expectedDiffPercent: number;
};

export async function seedRealFlowFixture(opts: {
  dataDir: string;
}): Promise<SeedResult> {
  const prisma = new PrismaClient();
  try {
    // 1. Reset any prior fixture state. Cascade deletes the run/test/
    //    attachment graph; baselines are deleted explicitly.
    const existing = await prisma.project.findUnique({
      where: { slug: FIXTURE_PROJECT_SLUG },
      select: { id: true },
    });
    if (existing) {
      await prisma.baseline.deleteMany({ where: { projectId: existing.id } });
      await prisma.project.delete({ where: { id: existing.id } });
    }

    // 2. Generate a meaningful expected/actual pair: solid grey baseline,
    //    actual that flips an 80x40 strip to red. ~6.7% diff against the
    //    400x300 image — clearly a "real change", not antialiasing noise.
    const width = 400;
    const height = 300;
    const expectedBuf = solidPng(width, height, [120, 120, 120, 255]);
    const actualBuf = stripPng(
      width,
      height,
      [120, 120, 120, 255],
      [220, 60, 60, 255],
      { x: 80, y: 100, w: 240, h: 80 },
    );
    // For the diff PNG we just need a placeholder image — Playwright
    // would have rendered a real diff overlay; the viewer just displays
    // whatever bytes the diff attachment points at.
    const diffBuf = stripPng(
      width,
      height,
      [20, 20, 20, 255],
      [255, 0, 110, 255],
      { x: 80, y: 100, w: 240, h: 80 },
    );

    // 3. Compute the same diff metric the ingest pipeline would,
    //    against the SAME bytes the viewer will serve. That guarantees
    //    the badge the UI renders matches what we assert against.
    const metric = await computeDiffMetric(expectedBuf, actualBuf);
    if (!metric) throw new Error('seed: pixelmatch returned null');

    // 4. Write attachments to disk under DATA_DIR using the same path
    //    conventions the parser uses (runs/<id>/attachments/...).
    const project = await prisma.project.create({
      data: {
        slug: FIXTURE_PROJECT_SLUG,
        name: 'Test fixture · real flow',
      },
    });

    const run = await prisma.run.create({
      data: {
        projectId: project.id,
        commitSha: 'fixturefixturefixturefixturefixturefixture',
        branch: 'feat/real-flow',
        prNumber: 42,
        ciProvider: 'github',
        ciRunUrl: 'https://github.com/example/repo/actions/runs/0',
        platform: 'linux',
        status: 'failed',
        finishedAt: new Date(),
        durationMs: 1234,
        totalTests: 1,
        passedTests: 0,
        failedTests: 1,
        flakyTests: 0,
        skippedTests: 0,
        storagePath: `runs/test-fixture`,
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        runId: run.id,
        titlePath: 'real-flow > dashboard renders signed-in view',
        title: 'dashboard renders signed-in view',
        file: 'tests/real-flow.spec.ts',
        line: 12,
        column: 1,
        projectName: 'chromium',
        status: 'failed',
        expectedStatus: 'passed',
        durationMs: 1234,
      },
    });

    const tr = await prisma.testResult.create({
      data: {
        testCaseId: tc.id,
        retry: 0,
        status: 'failed',
        durationMs: 1234,
        startedAt: new Date(),
        errorMessage:
          'Error: Screenshot comparison failed: 26880 pixels (~6.7%) differ',
      },
    });

    const snapshotName = 'home/dashboard.png';
    const baseRel = path.posix.join(run.storagePath, 'attachments');
    const expectedRel = path.posix.join(baseRel, 'expected.png');
    const actualRel = path.posix.join(baseRel, 'actual.png');
    const diffRel = path.posix.join(baseRel, 'diff.png');
    await fs.mkdir(path.join(opts.dataDir, baseRel), { recursive: true });
    await fs.writeFile(path.join(opts.dataDir, expectedRel), expectedBuf);
    await fs.writeFile(path.join(opts.dataDir, actualRel), actualBuf);
    await fs.writeFile(path.join(opts.dataDir, diffRel), diffBuf);

    await prisma.attachment.create({
      data: {
        testResultId: tr.id,
        name: `${snapshotName}-expected`,
        contentType: 'image/png',
        storagePath: expectedRel,
        sizeBytes: expectedBuf.length,
        kind: 'screenshot',
        snapshotKind: 'expected',
        snapshotName,
      },
    });
    await prisma.attachment.create({
      data: {
        testResultId: tr.id,
        name: `${snapshotName}-actual`,
        contentType: 'image/png',
        storagePath: actualRel,
        sizeBytes: actualBuf.length,
        kind: 'screenshot',
        snapshotKind: 'actual',
        snapshotName,
        snapshotPath: 'tests/__screenshots__/real-flow.spec.ts/dashboard.png',
      },
    });
    await prisma.attachment.create({
      data: {
        testResultId: tr.id,
        name: `${snapshotName}-diff`,
        contentType: 'image/png',
        storagePath: diffRel,
        sizeBytes: diffBuf.length,
        kind: 'screenshot',
        snapshotKind: 'diff',
        snapshotName,
        diffPixels: metric.diffPixels,
        diffPercent: metric.diffPercent,
      },
    });

    return {
      projectSlug: FIXTURE_PROJECT_SLUG,
      runId: run.id,
      testId: tc.id,
      snapshotName,
      expectedDiffPercent: metric.diffPercent,
    };
  } finally {
    await prisma.$disconnect();
  }
}

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

function stripPng(
  width: number,
  height: number,
  bg: [number, number, number, number],
  fg: [number, number, number, number],
  rect: { x: number; y: number; w: number; h: number },
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside =
        x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      const c = inside ? fg : bg;
      const idx = (width * y + x) << 2;
      png.data[idx + 0] = c[0];
      png.data[idx + 1] = c[1];
      png.data[idx + 2] = c[2];
      png.data[idx + 3] = c[3];
    }
  }
  return PNG.sync.write(png);
}
