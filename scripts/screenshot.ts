#!/usr/bin/env tsx
/**
 * Drive the viewer with Playwright and capture screenshots of every key
 * page. The point isn't visual regression here — it's letting Claude see
 * the UI it built, so it can iterate on real renderings instead of vibes.
 *
 * Usage:
 *   tsx scripts/screenshot.ts            # default base URL http://localhost:3000
 *   BASE_URL=... tsx scripts/screenshot.ts
 *
 * Outputs:
 *   /home/user/visualize/screenshots/<page>.png
 */
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_DIR = path.resolve('./screenshots');
const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Pull a couple ids out of the seeded DB so we can hit the detail pages.
  const prisma = new PrismaClient();
  const failingRun = await prisma.run.findFirst({
    where: {
      status: 'failed',
      tests: { some: { status: 'failed' } },
    },
    orderBy: { createdAt: 'desc' },
    include: { tests: { where: { status: 'failed' }, take: 1 } },
  });
  await prisma.$disconnect();

  if (!failingRun) {
    throw new Error('No seeded run with status=failed found. Run scripts/seed.ts first.');
  }
  const failingTest = failingRun.tests[0];
  if (!failingTest) {
    throw new Error('Failing run has no failing test cases.');
  }

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  const shots: Array<{ name: string; url: string }> = [
    { name: '01-home', url: `${BASE_URL}/` },
    { name: '02-run-detail', url: `${BASE_URL}/runs/${failingRun.id}` },
    {
      name: '03-test-detail-with-diff',
      url: `${BASE_URL}/runs/${failingRun.id}/tests/${failingTest.id}`,
    },
    { name: '04-sign-in', url: `${BASE_URL}/sign-in` },
  ];

  for (const shot of shots) {
    console.log(`→ ${shot.name}: ${shot.url}`);
    await page.goto(shot.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300); // let any animations settle
    const out = path.join(OUT_DIR, `${shot.name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`  saved ${path.relative(process.cwd(), out)}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
