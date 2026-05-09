import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/env';

/**
 * HMAC-signed short-lived URL tokens for unauthenticated trace.zip
 * delivery to https://trace.playwright.dev. Trace viewer is hosted on
 * a different origin, so it can't carry our session cookie — but we
 * still don't want trace files publicly enumerable. Compromise: an
 * authenticated viewer user gets a 5-minute signed URL they can hand
 * to the trace viewer; nobody else can guess one.
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export type SignedTraceToken = {
  attachmentId: string;
  exp: number;
};

export function signTraceToken(
  attachmentId: string,
  ttlMs: number = DEFAULT_TTL_MS,
  now: number = Date.now(),
): string {
  const exp = now + ttlMs;
  const payload = `${attachmentId}.${exp}`;
  const sig = hmac(payload);
  return `${payload}.${sig}`;
}

export function verifyTraceToken(
  token: string,
  now: number = Date.now(),
): SignedTraceToken | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [attachmentId, expStr, sig] = parts as [string, string, string];
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return null;
  const expectedSig = hmac(`${attachmentId}.${exp}`);
  if (!safeEqual(sig, expectedSig)) return null;
  return { attachmentId, exp };
}

function hmac(payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
