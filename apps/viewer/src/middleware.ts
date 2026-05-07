import { NextResponse, type NextRequest } from 'next/server';

// Edge-runtime middleware: stays small and avoids importing Auth.js. Reads
// the session cookie directly. Auth.js v5 uses `authjs.session-token` for
// JWT sessions (or the `__Secure-` prefixed variant on https).
const isDevBypass = process.env.DEV_AUTH_BYPASS === 'true';

export default function middleware(req: NextRequest) {
  if (isDevBypass) return NextResponse.next();

  const hasSession =
    req.cookies.get('authjs.session-token') ??
    req.cookies.get('__Secure-authjs.session-token');
  if (!hasSession) {
    const url = new URL('/sign-in', req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|api/health|_next/static|_next/image|favicon.ico|sign-in).*)',
  ],
};
