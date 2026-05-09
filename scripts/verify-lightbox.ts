#!/usr/bin/env tsx
/**
 * Drive the /demo/lightbox page with Playwright and capture the lightbox in
 * each interaction state. Lets the author review the UI without a DB.
 *
 *   tsx scripts/verify-lightbox.ts
 */
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = path.resolve('./screenshots/lightbox');
const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  const url = `${BASE_URL}/demo/lightbox`;
  console.log(`→ ${url}`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=home/dashboard.png');

  // 1. Gallery (cards) view
  await page.screenshot({ path: path.join(OUT_DIR, '01-gallery.png'), fullPage: true });

  // 2. Open lightbox by clicking the "actual" image of the first triplet
  await page.locator('img[alt="actual"]').first().click();
  await page.waitForSelector('div[role="dialog"][aria-label="Snapshot diff"]');
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(OUT_DIR, '02-lightbox-slider-default.png'),
  });

  // 3. Drag the slider divider to ~20% from the left
  const stage = page.locator('div[role="dialog"]').locator('div[style*="cursor: ew-resize"]').first();
  const box = await stage.boundingBox();
  if (box) {
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const endX = box.x + box.width * 0.2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, startY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: path.join(OUT_DIR, '03-lightbox-slider-dragged.png'),
    });
  }

  // 4. Switch to "side" view
  await page.keyboard.press('1');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT_DIR, '04-lightbox-side.png') });

  // 5. Switch to "onion" view
  await page.keyboard.press('3');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT_DIR, '05-lightbox-onion.png') });

  // 6. Switch to "diff" view
  await page.keyboard.press('4');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT_DIR, '06-lightbox-diff.png') });

  // 7. Zoom + pan: scroll wheel zoom in 6x
  const stageBox = await page
    .locator('div[role="dialog"]')
    .locator('div[style*="cursor: grab"], div[style*="cursor: grabbing"]')
    .first()
    .boundingBox();
  if (stageBox) {
    const cx = stageBox.x + stageBox.width / 2;
    const cy = stageBox.y + stageBox.height / 2;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT_DIR, '07-lightbox-zoomed.png') });
  }

  // 8. Navigate to next diff with →
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.locator('img[alt="actual"]').first().click();
  await page.waitForSelector('div[role="dialog"]');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT_DIR, '08-lightbox-next.png') });

  await browser.close();
  console.log(`✓ wrote ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
