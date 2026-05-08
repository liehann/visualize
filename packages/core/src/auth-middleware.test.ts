import { describe, expect, it } from 'vitest';
import { shouldRedirectToSignIn } from './auth-middleware.js';

describe('shouldRedirectToSignIn', () => {
  it('redirects unauthenticated requests when bypass is off', () => {
    expect(
      shouldRedirectToSignIn({ hasSession: false, isDevBypass: false }),
    ).toBe(true);
  });

  it('does not redirect authenticated requests', () => {
    expect(
      shouldRedirectToSignIn({ hasSession: true, isDevBypass: false }),
    ).toBe(false);
  });

  it('does not redirect when bypass is on, regardless of session', () => {
    expect(
      shouldRedirectToSignIn({ hasSession: false, isDevBypass: true }),
    ).toBe(false);
    expect(
      shouldRedirectToSignIn({ hasSession: true, isDevBypass: true }),
    ).toBe(false);
  });
});
