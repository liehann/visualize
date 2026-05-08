import { NextResponse, type NextRequest } from 'next/server';
import { shouldRedirectToSignIn } from '@visualize/core/auth-middleware';

// Edge-runtime middleware: stays small and avoids importing Auth.js. Reads
// the session cookie directly. Auth.js v5 uses `authjs.session-token` for
// JWT sessions (or the `__Secure-` prefixed variant on https).
//
// Decision logic lives in @visualize/core so it's covered by unit tests
// that don't require booting Next.js — gives the redirect rule always-on
// CI coverage even when dogfood Playwright tests skip under bypass.
const isDevBypass = process.env.DEV_AUTH_BYPASS === 'true';

export default function middleware(req: NextRequest) {
  const hasSession = !!(
    req.cookies.get('authjs.session-token') ??
    req.cookies.get('__Secure-authjs.session-token')
  );
  if (shouldRedirectToSignIn({ hasSession, isDevBypass })) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|api/health|_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|twitter-image|sign-in).*)',
  ],
};
