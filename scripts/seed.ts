#!/usr/bin/env tsx
/**
 * Seed realistic sample data for local dev.
 *
 *   tsx scripts/seed.ts
 *
 * Creates 2 projects with several runs covering:
 *   - all-pass
 *   - mixed failures with a snapshot diff triplet (real PNGs)
 *   - in-progress
 *   - flaky (multiple retries)
 *
 * Files (PNGs, video, trace) are written under DATA_DIR so the viewer can
 * render them. PNGs are generated procedurally with `pngjs` (already a dep).
 */
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import 'dotenv/config';

const prisma = new PrismaClient();
const DATA_DIR = process.env.DATA_DIR || path.resolve('./data');

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

/** Generate a solid-color PNG and write it under DATA_DIR. Returns relative path. */
async function generatePng(
  relPath: string,
  rgb: [number, number, number],
  width = 1200,
  height = 800,
  noisy = false,
): Promise<{ rel: string; size: number }> {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const noise = noisy ? Math.random() * 40 - 20 : 0;
      png.data[idx] = Math.max(0, Math.min(255, rgb[0] + noise));
      png.data[idx + 1] = Math.max(0, Math.min(255, rgb[1] + noise));
      png.data[idx + 2] = Math.max(0, Math.min(255, rgb[2] + noise));
      png.data[idx + 3] = 255;
    }
  }
  const buf = PNG.sync.write(png);
  const abs = path.join(DATA_DIR, relPath);
  await ensureDir(path.dirname(abs));
  await fs.writeFile(abs, buf);
  return { rel: relPath, size: buf.length };
}

async function generateText(relPath: string, content: string): Promise<{ rel: string; size: number }> {
  const abs = path.join(DATA_DIR, relPath);
  await ensureDir(path.dirname(abs));
  await fs.writeFile(abs, content);
  return { rel: relPath, size: Buffer.byteLength(content) };
}

async function generateBinary(relPath: string, bytes: number): Promise<{ rel: string; size: number }> {
  const abs = path.join(DATA_DIR, relPath);
  await ensureDir(path.dirname(abs));
  const buf = Buffer.alloc(bytes, 0x42);
  await fs.writeFile(abs, buf);
  return { rel: relPath, size: bytes };
}

async function main() {
  console.log('Seeding into', DATA_DIR);

  // --- Wipe existing rows (FK cascades handle children) -------------------
  await prisma.annotation.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.testResult.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.run.deleteMany();
  await prisma.baseline.deleteMany();
  await prisma.project.deleteMany();

  const phloots = await prisma.project.create({
    data: { slug: 'phloots-web', name: 'phloots-web' },
  });
  const api = await prisma.project.create({
    data: { slug: 'phloots-api', name: 'phloots-api' },
  });

  // --- Run 1: phloots-web, mixed (1 fail w/ diff, lots of passes) ---------
  const runId1 = `run_${Math.random().toString(36).slice(2, 10)}`;
  const bundle1 = `runs/${runId1}/`;

  // Snapshot triplet: a passing baseline + a slightly-noisy actual + a hot-pink diff.
  const expected = await generatePng(`${bundle1}data/homepage-hero-expected.png`, [40, 60, 90]);
  const actual = await generatePng(`${bundle1}data/homepage-hero-actual.png`, [40, 60, 90], 1200, 800, true);
  const diff = await generatePng(`${bundle1}data/homepage-hero-diff.png`, [255, 60, 200]);
  const video = await generateBinary(`${bundle1}data/login-flow.webm`, 50_000);
  const trace = await generateBinary(`${bundle1}data/trace.zip`, 80_000);

  const run1 = await prisma.run.create({
    data: {
      id: runId1,
      projectId: phloots.id,
      status: 'failed',
      branch: 'feat/login-redesign',
      prNumber: 142,
      commitSha: '7a4c9e2f3b1d8e6a5c4b3f2e1d0a9b8c7d6e5f4a',
      ciProvider: 'github',
      ciRunUrl: 'https://github.com/liehann/phloots/actions/runs/1234',
      storagePath: bundle1,
      // createdAt drives ordering on the home page; force this to "now" so
      // the failing run with the snapshot diff is the project's latest.
      createdAt: new Date(),
      startedAt: new Date(Date.now() - 1000 * 60 * 12),
      finishedAt: new Date(Date.now() - 1000 * 60 * 4),
      durationMs: 8 * 60 * 1000,
      totalTests: 42,
      passedTests: 39,
      failedTests: 1,
      flakyTests: 1,
      skippedTests: 1,
    },
  });

  // The failing test with the snapshot diff
  const failed = await prisma.testCase.create({
    data: {
      runId: run1.id,
      titlePath: 'auth flows > homepage hero matches snapshot',
      title: 'homepage hero matches snapshot',
      file: 'tests/auth.spec.ts',
      line: 23,
      projectName: 'chromium',
      status: 'failed',
      durationMs: 4_320,
    },
  });
  const failedResult = await prisma.testResult.create({
    data: {
      testCaseId: failed.id,
      retry: 0,
      status: 'failed',
      durationMs: 4_320,
      startedAt: new Date(Date.now() - 1000 * 60 * 8),
      workerIndex: 2,
      errorMessage:
        "Error: expect(page).toHaveScreenshot('homepage-hero.png')\n\n  47 pixels (0.005% of all image pixels) are different.",
      errorSnippet:
        "  21 |   await page.goto('/');\n> 22 |   await expect(page).toHaveScreenshot('homepage-hero.png');\n     |                      ^\n  23 | });",
      errorStack:
        'Error: ...\n    at /repo/tests/auth.spec.ts:22:22\n    at /node_modules/@playwright/test/lib/runner.js:421:13',
    },
  });
  await prisma.attachment.createMany({
    data: [
      {
        testResultId: failedResult.id,
        name: 'homepage-hero-expected',
        contentType: 'image/png',
        kind: 'screenshot',
        snapshotKind: 'expected',
        snapshotName: 'homepage-hero',
        storagePath: expected.rel,
        sizeBytes: expected.size,
      },
      {
        testResultId: failedResult.id,
        name: 'homepage-hero-actual',
        contentType: 'image/png',
        kind: 'screenshot',
        snapshotKind: 'actual',
        snapshotName: 'homepage-hero',
        storagePath: actual.rel,
        sizeBytes: actual.size,
      },
      {
        testResultId: failedResult.id,
        name: 'homepage-hero-diff',
        contentType: 'image/png',
        kind: 'screenshot',
        snapshotKind: 'diff',
        snapshotName: 'homepage-hero',
        storagePath: diff.rel,
        sizeBytes: diff.size,
      },
      {
        testResultId: failedResult.id,
        name: 'video',
        contentType: 'video/webm',
        kind: 'video',
        storagePath: video.rel,
        sizeBytes: video.size,
      },
      {
        testResultId: failedResult.id,
        name: 'trace',
        contentType: 'application/zip',
        kind: 'trace',
        storagePath: trace.rel,
        sizeBytes: trace.size,
      },
    ],
  });

  // Bunch of passing tests for shape
  const passingTests = [
    'auth flows > redirects unauthenticated to /sign-in',
    'auth flows > sign-in form validation',
    'auth flows > forgot-password link works',
    'dashboard > renders empty state',
    'dashboard > renders project cards',
    'dashboard > sparkline shows last 30 runs',
    'navigation > top nav shows user email',
    'navigation > sign-out clears session',
    'settings > profile form saves',
    'settings > theme toggle persists',
  ];
  for (const titlePath of passingTests) {
    const tc = await prisma.testCase.create({
      data: {
        runId: run1.id,
        titlePath,
        title: titlePath.split(' > ').slice(-1)[0]!,
        file: `tests/${titlePath.split(' > ')[0]!.replace(/ /g, '-')}.spec.ts`,
        line: Math.floor(Math.random() * 100) + 10,
        projectName: 'chromium',
        status: 'passed',
        durationMs: Math.floor(Math.random() * 2000) + 200,
      },
    });
    await prisma.testResult.create({
      data: {
        testCaseId: tc.id,
        retry: 0,
        status: 'passed',
        durationMs: tc.durationMs,
      },
    });
  }

  // A flaky test
  const flaky = await prisma.testCase.create({
    data: {
      runId: run1.id,
      titlePath: 'navigation > breadcrumbs update on route change',
      title: 'breadcrumbs update on route change',
      file: 'tests/navigation.spec.ts',
      line: 88,
      projectName: 'chromium',
      status: 'flaky',
      durationMs: 8_000,
    },
  });
  await prisma.testResult.createMany({
    data: [
      { testCaseId: flaky.id, retry: 0, status: 'failed', durationMs: 4000 },
      { testCaseId: flaky.id, retry: 1, status: 'passed', durationMs: 4000 },
    ],
  });

  // A skipped
  const skipped = await prisma.testCase.create({
    data: {
      runId: run1.id,
      titlePath: 'experiments > new onboarding flow (gated)',
      title: 'new onboarding flow (gated)',
      file: 'tests/experiments.spec.ts',
      line: 5,
      projectName: 'chromium',
      status: 'skipped',
      durationMs: 0,
    },
  });
  await prisma.testResult.create({
    data: { testCaseId: skipped.id, retry: 0, status: 'skipped', durationMs: 0 },
  });

  // --- Run 2: phloots-web, all-pass on main -------------------------------
  const run2 = await prisma.run.create({
    data: {
      projectId: phloots.id,
      status: 'passed',
      branch: 'main',
      commitSha: 'a1b2c3d4e5f6789012345678901234567890abcd',
      ciProvider: 'github',
      ciRunUrl: 'https://github.com/liehann/phloots/actions/runs/1230',
      storagePath: 'runs/example-pass/',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      finishedAt: new Date(Date.now() - 1000 * 60 * 60 * 3 + 7 * 60 * 1000),
      durationMs: 7 * 60 * 1000,
      totalTests: 42,
      passedTests: 41,
      failedTests: 0,
      flakyTests: 0,
      skippedTests: 1,
    },
  });

  // --- Run 3: phloots-web, in-progress ------------------------------------
  await prisma.run.create({
    data: {
      projectId: phloots.id,
      status: 'running',
      branch: 'feat/dashboard-cards',
      prNumber: 145,
      commitSha: 'fedcba9876543210fedcba9876543210fedcba98',
      ciProvider: 'github',
      ciRunUrl: 'https://github.com/liehann/phloots/actions/runs/1240',
      storagePath: 'runs/example-running/',
      // Slightly older than run1 so the failing run is the visible latest.
      createdAt: new Date(Date.now() - 1000 * 60 * 5),
      startedAt: new Date(Date.now() - 1000 * 60 * 2),
      totalTests: 42,
      passedTests: 18,
      failedTests: 0,
      flakyTests: 0,
      skippedTests: 0,
    },
  });

  // --- Several historical runs for the sparkline -------------------------
  for (let i = 4; i < 30; i++) {
    const allPass = Math.random() > 0.15;
    const ageMs = 1000 * 60 * 60 * i * 6;
    await prisma.run.create({
      data: {
        projectId: phloots.id,
        status: allPass ? 'passed' : 'failed',
        branch: i % 3 === 0 ? 'main' : `feat/rev-${i}`,
        prNumber: i % 3 === 0 ? null : 100 + i,
        commitSha: Math.random().toString(36).repeat(10).slice(0, 40),
        storagePath: `runs/historical-${i}/`,
        createdAt: new Date(Date.now() - ageMs),
        startedAt: new Date(Date.now() - ageMs),
        finishedAt: new Date(Date.now() - ageMs + 5 * 60 * 1000),
        durationMs: (4 + Math.random() * 3) * 60 * 1000,
        totalTests: 42,
        passedTests: allPass ? 42 : 38 + Math.floor(Math.random() * 3),
        failedTests: allPass ? 0 : 1 + Math.floor(Math.random() * 3),
        flakyTests: 0,
        skippedTests: 0,
      },
    });
  }

  // --- API project: a couple of runs --------------------------------------
  await prisma.run.create({
    data: {
      projectId: api.id,
      status: 'passed',
      branch: 'main',
      commitSha: 'b2c3d4e5f6789012345678901234567890abcdef',
      storagePath: 'runs/api-1/',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 1),
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 1),
      finishedAt: new Date(Date.now() - 1000 * 60 * 55),
      durationMs: 5 * 60 * 1000,
      totalTests: 18,
      passedTests: 18,
    },
  });
  await prisma.run.create({
    data: {
      projectId: api.id,
      status: 'failed',
      branch: 'feat/rate-limit',
      prNumber: 22,
      commitSha: 'c3d4e5f6789012345678901234567890abcdef00',
      storagePath: 'runs/api-2/',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
      finishedAt: new Date(Date.now() - 1000 * 60 * 60 * 4 + 4 * 60 * 1000),
      durationMs: 4 * 60 * 1000,
      totalTests: 18,
      passedTests: 16,
      failedTests: 2,
    },
  });

  console.log('Seed complete.');
  console.log('  - phloots-web: 30 runs (1 failing with snapshot diff, 1 in-progress)');
  console.log('  - phloots-api: 2 runs');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
