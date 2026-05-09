import { test, expect } from '@playwright/test';
import path from 'node:path';
import { seedRealFlowFixture, type SeedResult } from './fixtures/seed.js';

/**
 * Real-flow walkthrough of the PR-feedback-loop features. Single video
 * for reviewers — but the data behind the UI is real: a Project + Run
 * is seeded into Postgres with on-disk PNG attachments, and the
 * production `@visualize/core/diff_metrics` runs over them so the
 * `diffPercent` rendered in the badge is the same value the ingest
 * pipeline would have computed in production.
 *
 * Runs in the `chromium-seeded` Playwright project, which depends on
 * `chromium-empty` so the home / empty-state snapshot test runs against
 * a clean DB before this seed lands.
 */

let fixture: SeedResult;

test.beforeAll(async () => {
  // DATA_DIR matches what the dev viewer uses — it's where /api/files
  // resolves attachments from. Default to a CI-friendly tmp path that
  // the visualize.yml workflow already sets via env.
  const dataDir = process.env.DATA_DIR || path.resolve('./data');
  fixture = await seedRealFlowFixture({ dataDir });
});

test('real-flow tour — run → test → lightbox → bulk approve', async ({ page }) => {
  // 1. Run page renders the seeded run with branch + PR + pending banner.
  await page.goto(`/runs/${fixture.runId}`);
  await expect(page.getByText('Test fixture · real flow')).toBeVisible();
  await expect(page.getByText('feat/real-flow')).toBeVisible();
  await expect(
    page.getByText(/visual change.* pending review/i),
  ).toBeVisible();

  // 2. Click into the failing test.
  await page.getByText('real-flow > dashboard renders signed-in view').click();
  await expect(
    page.getByRole('heading', { name: /real-flow > dashboard/i }),
  ).toBeVisible();

  // 3. Diff card shows a real, non-zero percent badge — the same value
  //    the ingest pipeline computed at upload time.
  const expectedPctText = formatBadge(fixture.expectedDiffPercent);
  await expect(page.getByText(expectedPctText).first()).toBeVisible();

  // 4. Click the actual image → lightbox opens. Header carries the same
  //    badge, snapshot name matches.
  await page.locator('img[alt="actual"]').first().click();
  const dialog = page.getByRole('dialog', { name: 'Snapshot diff' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(fixture.snapshotName)).toBeVisible();
  await expect(dialog.getByText(expectedPctText).first()).toBeVisible();
  await page.waitForTimeout(400);

  // 5. Drag the slider to ~25% and verify the clip-path moved.
  const stage = dialog.locator('div[style*="cursor: ew-resize"]').first();
  const box = await stage.boundingBox();
  if (!box) throw new Error('slider stage missing bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const clip = await dialog
    .locator('[style*="clip-path"]')
    .first()
    .evaluate((el) => (el as HTMLElement).style.clipPath);
  expect(clip).toMatch(/2[0-9](?:\.\d+)?%/);

  // 6. Cycle modes: side, onion, diff, then back to slider.
  await page.keyboard.press('1');
  await page.waitForTimeout(250);
  await expect(dialog.getByText('expected')).toBeVisible();
  await page.keyboard.press('3');
  await page.waitForTimeout(250);
  await page.keyboard.press('4');
  await page.waitForTimeout(250);
  await expect(dialog.getByText('100%')).toBeVisible(); // zoom indicator
  await page.keyboard.press('2');
  await page.waitForTimeout(250);

  // 7. Wheel zoom on the diff stage so the recording shows the zoom UX.
  const diffSurface = dialog
    .locator('div[style*="cursor: grab"], div[style*="cursor: grabbing"]')
    .first();
  const dbox = await diffSurface.boundingBox();
  if (dbox) {
    await page.mouse.move(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(300);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // 8. Back at the run page, open the bulk-approve sheet. The single
  //    pending diff is listed with its impact badge.
  await page.goto(`/runs/${fixture.runId}`);
  await page.getByRole('button', { name: /approve all 1/i }).click();
  await expect(
    page.getByRole('heading', { name: /approve 1 visual change/i }),
  ).toBeVisible();
  await expect(page.getByText(fixture.snapshotName)).toBeVisible();
  await expect(page.getByText(expectedPctText).first()).toBeVisible();
  await page.waitForTimeout(500);
  // Don't actually approve — the next test run would have nothing
  // pending to demonstrate. Cancel keeps the fixture data ready to
  // re-render on subsequent runs.
  await page.getByRole('button', { name: /^cancel$/i }).click();
});

function formatBadge(percent: number): string {
  // Mirror the rendering in DiffPercentBadge: ≥1% → 1 decimal,
  // ≥0.01% → 2 decimals, smaller → "<0.01".
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  if (percent >= 0.01) return `${percent.toFixed(2)}%`;
  return '<0.01%';
}
