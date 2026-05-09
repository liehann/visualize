import { describe, expect, it } from 'vitest';
import { signTraceToken, verifyTraceToken } from './signed-trace.js';
// vitest.setup.ts populates AUTH_SECRET (and the other env-required
// vars) before any module loads.

describe('signed-trace tokens', () => {
  it('round-trips an attachment id through sign + verify', () => {
    const now = Date.now();
    const token = signTraceToken('att-1', 60_000, now);
    const verified = verifyTraceToken(token, now + 1_000);
    expect(verified).toEqual({
      attachmentId: 'att-1',
      exp: now + 60_000,
    });
  });

  it('rejects expired tokens', () => {
    const now = Date.now();
    const token = signTraceToken('att-1', 1_000, now);
    expect(verifyTraceToken(token, now + 2_000)).toBeNull();
  });

  it('rejects tampered tokens (modified attachmentId)', () => {
    const now = Date.now();
    const token = signTraceToken('att-1', 60_000, now);
    const parts = token.split('.');
    const tampered = ['att-2', parts[1], parts[2]].join('.');
    expect(verifyTraceToken(tampered, now)).toBeNull();
  });

  it('rejects tampered signatures', () => {
    const now = Date.now();
    const token = signTraceToken('att-1', 60_000, now);
    const tampered = token.slice(0, -3) + 'AAA';
    expect(verifyTraceToken(tampered, now)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyTraceToken('garbage')).toBeNull();
    expect(verifyTraceToken('a.b')).toBeNull();
    expect(verifyTraceToken('a.b.c.d')).toBeNull();
  });

  it('rejects tokens whose exp is not a number', () => {
    const now = Date.now();
    const token = signTraceToken('att-1', 60_000, now);
    const parts = token.split('.');
    const tampered = [parts[0], 'not-a-number', parts[2]].join('.');
    expect(verifyTraceToken(tampered, now)).toBeNull();
  });
});
