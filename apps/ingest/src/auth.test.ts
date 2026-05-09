import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { requireBearer } from './auth.js';

const SECRET = 'test-global-secret-1234567890';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.addHook('onRequest', requireBearer(SECRET));
  app.get('/healthz', async () => ({ ok: true }));
  app.post('/echo', async (req) => ({
    authMode: req.authMode,
    hasToken: !!req.bearerToken,
  }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('requireBearer', () => {
  it('exempts GET /healthz from auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects requests with no Authorization header', async () => {
    const res = await app.inject({ method: 'POST', url: '/echo' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'Unauthorized' });
  });

  it('rejects malformed Authorization headers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { authorization: 'Basic abc' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an empty Bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { authorization: 'Bearer ' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('marks the request `global` when the token equals API_SECRET', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authMode: 'global', hasToken: true });
  });

  it('marks a non-global token `deferred` for per-project auth to handle', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { authorization: 'Bearer some-project-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authMode: 'deferred', hasToken: true });
  });

  it('uses constant-time comparison (length-mismatched tokens are deferred, not global)', async () => {
    // Same prefix as SECRET but shorter — must NOT pass as global.
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { authorization: 'Bearer test-global-secret' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ authMode: 'deferred' });
  });
});
