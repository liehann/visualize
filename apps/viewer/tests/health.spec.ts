import { test, expect } from '@playwright/test';

const isDevBypass = process.env.DEV_AUTH_BYPASS === 'true';

/**
 * Sanity check that the unauthenticated `/` redirect to `/sign-in` works.
 *
 * Skipped under DEV_AUTH_BYPASS=true (the dogfood CI default) because the
 * middleware short-circuits the redirect in bypass mode. Run locally
 * without bypass to exercise this. The middleware's redirect logic is
 * unit-tested in @visualize/core (`shouldRedirectToSignIn`), which runs
 * in the typecheck CI without bypass — that's the always-on coverage
 * for the redirect rule.
 */
test('home redirects to sign-in when unauthenticated', async ({ request }) => {
  test.skip(isDevBypass, 'DEV_AUTH_BYPASS short-circuits the middleware redirect');
  const res = await request.get('/', { maxRedirects: 0 });
  expect([302, 307, 308]).toContain(res.status());
  const loc = res.headers()['location'];
  expect(loc).toContain('sign-in');
});
