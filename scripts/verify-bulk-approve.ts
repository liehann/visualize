#!/usr/bin/env tsx
/**
 * Drive the /demo/bulk-approve page with Playwright and capture each state
 * of the bulk-approve banner + confirmation sheet.
 */
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = path.resolve('./screenshots/bulk-approve');
const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/demo/bulk-approve`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=visual changes pending review');
  await page.screenshot({ path: path.join(OUT_DIR, '01-banner.png'), fullPage: true });

  // Open the confirmation sheet
  await page.getByRole('button', { name: /approve all/i }).first().click();
  await page.waitForSelector('h2:has-text("Approve")');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT_DIR, '02-sheet.png') });

  // Click confirm — request will fail (no DB), exercising the error path
  await page.getByRole('button', { name: /^approve all$/i }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '03-sheet-after-attempt.png') });

  await browser.close();
  console.log(`✓ wrote ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
