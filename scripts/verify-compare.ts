#!/usr/bin/env tsx
/**
 * Drive the /demo/compare page with Playwright and capture the run-vs-run
 * comparison view in its key states (default + overlay toggle).
 */
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = path.resolve('./screenshots/compare');
const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/demo/compare`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1:has-text("Run-vs-run comparison")');
  await page.screenshot({
    path: path.join(OUT_DIR, '01-default.png'),
    fullPage: true,
  });

  // Switch the first changed snapshot to overlay mode
  const overlayTab = page.getByRole('tab', { name: 'overlay' }).first();
  if (await overlayTab.count()) {
    await overlayTab.click();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: path.join(OUT_DIR, '02-overlay.png'),
      fullPage: true,
    });
  }

  await browser.close();
  console.log(`✓ wrote ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
