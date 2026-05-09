/**
 * Vitest setup that runs once before any test module is imported.
 * `env.ts` evaluates `Schema.parse(process.env)` at import-time, so
 * the env vars need to be set before that module is loaded — and
 * `beforeAll` is too late.
 *
 * Production gets these from Coolify; tests use placeholders that
 * satisfy the zod shape without doing anything externally.
 */
process.env.DATABASE_URL ||= 'postgresql://x:y@host/db';
process.env.DATA_DIR ||= '/tmp/visualize-test';
process.env.AUTH_SECRET ||= 'unit-test-auth-secret-thats-long-enough-to-pass';
process.env.AUTHENTIK_ISSUER ||= 'https://example.invalid/';
process.env.AUTHENTIK_CLIENT_ID ||= 'unit-test';
process.env.AUTHENTIK_CLIENT_SECRET ||= 'unit-test';
process.env.VIEWER_URL ||= 'http://localhost:3000';
