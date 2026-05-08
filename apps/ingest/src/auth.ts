import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';
import { prisma, verifyUploadToken } from '@visualize/core';

const BEARER_PREFIX = 'Bearer ';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Set by the global auth hook. `'global'` means the request matched
     * `API_SECRET` (legacy single-secret CI). `'deferred'` means the request
     * carried a Bearer token but it isn't the global secret — handlers MUST
     * call `verifyDeferredToken` before trusting it.
     */
    authMode?: 'global' | 'deferred';
    bearerToken?: string;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Global onRequest hook. Verifies the request carries a Bearer token; if it
 * matches `API_SECRET` we mark it `global` and the handler is done. Otherwise
 * we attach the raw token as `deferred` and require the handler to verify
 * against a per-project token (which the handler can only do once it knows
 * which project the upload is for).
 *
 * GET /healthz is exempt.
 */
export function requireBearer(globalSecret: string): onRequestHookHandler {
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
    if (!token) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Empty Bearer token' });
      return reply;
    }
    req.bearerToken = token;
    req.authMode = safeEqual(token, globalSecret) ? 'global' : 'deferred';
  };
}

/**
 * Verify a deferred Bearer token against a project's stored hash. Updates
 * `tokenLastUsedAt` on success so the viewer's setup screen can show a
 * green "we've seen this token" indicator.
 *
 * Returns true if the request is authorized for this project (either via
 * the global secret OR a matching per-project token).
 */
export async function authorizeProjectUpload(
  req: FastifyRequest,
  projectSlug: string,
): Promise<boolean> {
  if (req.authMode === 'global') return true;
  if (req.authMode !== 'deferred' || !req.bearerToken) return false;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, uploadTokenHash: true },
  });
  if (!project?.uploadTokenHash) return false;
  if (!verifyUploadToken(req.bearerToken, project.uploadTokenHash)) return false;

  await prisma.project.update({
    where: { id: project.id },
    data: { tokenLastUsedAt: new Date() },
  });
  return true;
}
