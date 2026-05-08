import { test, expect } from '@playwright/test';

const isDevBypass = process.env.DEV_AUTH_BYPASS === 'true';

/**
 * Smoke: an unauthenticated visit redirects to /sign-in (Auth.js middleware).
 * This doesn't depend on a real Authentik backend — we only assert the
 * sign-in page renders.
 *
 * Skipped under DEV_AUTH_BYPASS=true (the dogfood CI default) because
 * bypass mode short-circuits the middleware redirect this test asserts.
 * Run locally without bypass to validate the unbypassed path; the
 * middleware unit test in @visualize/core covers the same logic.
 */
test('unauthenticated visitor lands on sign-in', async ({ page }) => {
  test.skip(isDevBypass, 'DEV_AUTH_BYPASS bypasses the middleware redirect');
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('button', { name: /sign in with authentik/i })).toBeVisible();
});

test('sign-in page screenshot', async ({ page }) => {
  await page.goto('/sign-in');
  // Use a selector that's unique on /sign-in: the "Sign in with Authentik"
  // button. `getByText('visualize')` matched the header link, the
  // `dev@visualize.local` user-email span (substring), and the card
  // heading — strict-mode failure that masked the actual screenshot
  // assertion.
  await expect(
    page.getByRole('button', { name: /sign in with authentik/i }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot('sign-in.png', { maxDiffPixelRatio: 0.02 });
});
