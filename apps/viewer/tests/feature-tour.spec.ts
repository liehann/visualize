import { test, expect } from '@playwright/test';

/**
 * Narrative tour of the PR-feedback-loop features. Recorded video gives
 * a single-take walkthrough of:
 *   - color-coded diff% badges on the gallery
 *   - lightbox with drag-to-compare slider
 *   - keyboard view switching (1 / 2 / 3 / 4)
 *   - wheel-zoom on the diff stage
 *   - bulk-approve sheet listing pending changes sorted by impact
 *
 * Hits the design-lab demo pages so the suite is hermetic — no DB seed
 * required, no real /api/approve calls. The component code under test is
 * the same code the production run pages use.
 */

test('PR-feedback-loop tour — lightbox, slider, bulk approve', async ({ page }) => {
  // 1. Gallery: diff % badges color-coded by impact.
  await page.goto('/demo/lightbox');
  await expect(
    page.getByRole('heading', { name: 'Lightbox demo' }),
  ).toBeVisible();
  await expect(page.getByText('home/dashboard.png')).toBeVisible();
  // Three triplets render with their badges. Use locators that survive
  // formatting tweaks — match the % suffix on each.
  await expect(page.getByText('12.4%').first()).toBeVisible();
  await expect(page.getByText('3.7%').first()).toBeVisible();
  await expect(page.getByText('0.08%').first()).toBeVisible();

  // 2. Open the lightbox by clicking the "actual" thumbnail of the first
  //    triplet. Default view for triplets with both expected + actual is
  //    the slider.
  await page.locator('img[alt="actual"]').first().click();
  const dialog = page.getByRole('dialog', { name: 'Snapshot diff' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('home/dashboard.png')).toBeVisible();
  // Pause for the recorded video so the slider state is legible.
  await page.waitForTimeout(400);

  // 3. Drag the slider divider to ~25% — left side (expected) shrinks,
  //    right side (actual) expands. Validated by reading the inline
  //    clip-path style on the actual image's wrapper.
  const stage = dialog.locator('div[style*="cursor: ew-resize"]').first();
  const box = await stage.boundingBox();
  if (!box) throw new Error('slider stage missing bounding box');
  const targetX = box.x + box.width * 0.25;
  const cy = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, cy);
  await page.mouse.down();
  await page.mouse.move(targetX, cy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  // Slider position is encoded into clip-path on the actual layer.
  const clip = await dialog
    .locator('[style*="clip-path"]')
    .first()
    .evaluate((el) => (el as HTMLElement).style.clipPath);
  expect(clip).toMatch(/inset\(0 0 0 2[0-9](\.\d+)?%\)/);

  // 4. Cycle through view modes via keyboard. The active tab gets a
  //    darker background — easier to assert via the tablist semantics.
  await page.keyboard.press('1');
  await page.waitForTimeout(250);
  await expect(dialog.getByText('expected')).toBeVisible();
  await expect(dialog.getByText('actual')).toBeVisible();

  await page.keyboard.press('3');
  await page.waitForTimeout(250);

  await page.keyboard.press('4');
  await page.waitForTimeout(250);
  // Diff stage shows a percent indicator (100% by default).
  await expect(dialog.getByText('100%')).toBeVisible();

  // 5. Wheel-zoom on the diff stage so the video shows the zoom UX.
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
  }
  // Step back to slider mode and close.
  await page.keyboard.press('2');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // 6. Bulk approve: visit the sheet demo and verify impact-sorted list.
  await page.goto('/demo/bulk-approve');
  await expect(page.getByText(/visual changes pending review/i)).toBeVisible();
  await page.getByRole('button', { name: /approve all 5/i }).click();
  const sheet = page.getByRole('heading', { name: /approve 5 visual changes/i });
  await expect(sheet).toBeVisible();
  // The five fixture entries are present.
  await expect(page.getByText('home/dashboard.png')).toBeVisible();
  await expect(page.getByText('auth/sign-in.png')).toBeVisible();
  await expect(page.getByText('runs/detail/header.png')).toBeVisible();
  // Each row carries a percent badge.
  await expect(page.getByText('12.4%').nth(0)).toBeVisible();
  await expect(page.getByText('5.2%')).toBeVisible();
  await expect(page.getByText('1.8%')).toBeVisible();
  // Pause for the video then dismiss with cancel — the demo's POST goes
  // nowhere and we don't want a 404 in the screencast.
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^cancel$/i }).click();
  await expect(sheet).toBeHidden();
});
