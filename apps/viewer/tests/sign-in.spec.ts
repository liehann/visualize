import { test, expect } from '@playwright/test';

/**
 * Smoke: an unauthenticated visit redirects to /sign-in (Auth.js middleware).
 * This doesn't depend on a real Authentik backend — we only assert the
 * sign-in page renders.
 */
test('unauthenticated visitor lands on sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('button', { name: /sign in with authentik/i })).toBeVisible();
});

test('sign-in page screenshot', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByText('visualize')).toBeVisible();
  await expect(page).toHaveScreenshot('sign-in.png', { maxDiffPixelRatio: 0.02 });
});
