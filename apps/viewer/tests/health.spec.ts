import { test, expect } from '@playwright/test';

/**
 * Sanity check that the viewer process is up and serving HTML.
 */
test('home redirects to sign-in when unauthenticated', async ({ request }) => {
  const res = await request.get('/', { maxRedirects: 0 });
  // Auth.js middleware should redirect to the sign-in URL.
  expect([302, 307, 308]).toContain(res.status());
  const loc = res.headers()['location'];
  expect(loc).toContain('sign-in');
});
