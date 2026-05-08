import { test, expect } from '@playwright/test';

/**
 * Home page screenshot tests. These run with DEV_AUTH_BYPASS=true so the
 * middleware lets us through without standing up Authentik. Empty state
 * is exercised against a freshly-migrated CI database (no Project rows).
 */
test('home / empty state', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /projects/i }),
  ).toBeVisible();
  await expect(page.getByText(/no projects yet/i)).toBeVisible();
  await expect(
    page.getByRole('link', { name: /connect a github repo/i }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot('home-empty.png', {
    maxDiffPixelRatio: 0.02,
    fullPage: true,
  });
});

test('new project / form', async ({ page }) => {
  await page.goto('/projects/new');
  await expect(
    page.getByRole('heading', { name: /connect a github repo/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/github repository/i)).toBeVisible();
  await expect(page).toHaveScreenshot('new-project.png', {
    maxDiffPixelRatio: 0.02,
    fullPage: true,
  });
});
