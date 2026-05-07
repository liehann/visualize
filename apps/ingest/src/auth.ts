import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';

const BEARER_PREFIX = 'Bearer ';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Build a Fastify `onRequest` hook that requires `Authorization: Bearer <secret>`.
 * GET /healthz is allowed unauthenticated.
 */
export function requireBearer(secret: string): onRequestHookHandler {
  return async function authHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (req.method === 'GET' && req.url.split('?')[0] === '/healthz') {
      return;
    }
    const header = req.headers['authorization'];
    if (!header || typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing Bearer token' });
      return reply;
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    if (!token || !safeEqual(token, secret)) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid Bearer token' });
      return reply;
    }
  };
}
