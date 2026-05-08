/**
 * Pure decision logic for the viewer's edge middleware. Lives in core so
 * it's covered by the typecheck CI's unit-test job (which runs without
 * DEV_AUTH_BYPASS), giving the redirect rule always-on coverage even
 * when the dogfood Playwright suite skips its auth tests under bypass.
 */
export function shouldRedirectToSignIn(input: {
  hasSession: boolean;
  isDevBypass: boolean;
}): boolean {
  if (input.isDevBypass) return false;
  return !input.hasSession;
}
