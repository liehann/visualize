export { auth as middleware } from './auth.js';

export const config = {
  // Protect everything except auth callback routes + static assets.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|sign-in).*)'],
};
