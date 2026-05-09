import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@visualize/core/db';
import { resolveDataPath } from '@visualize/core/storage';
import { authorizeProjectUpload } from '../auth.js';

/**
 * Fetch endpoints for the consumer's CI to pull approved baselines into
 * the working tree before Playwright runs.
 *
 * Two-step protocol:
 *   1) GET /projects/:slug/baselines  → JSON list of { id, path, sizeBytes }
 *   2) GET /baselines/:id/image       → PNG bytes
 *
 * Both gated by the project's Bearer token (or the global API_SECRET) —
 * baselines aren't public the way runs are. The action iterates the list
 * and writes each PNG to its `path` under the consumer's repo root.
 */
export async function registerBaselineFetchRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/projects/:slug/baselines',
    async (
      req: FastifyRequest<{ Params: { slug: string } }>,
      _reply: FastifyReply,
    ) => {
      const { slug } = req.params;
      if (!(await authorizeProjectUpload(req, slug))) {
        throw app.httpErrors.unauthorized(
          'Bearer token does not match this project.',
        );
      }
      const project = await prisma.project.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!project) {
        throw app.httpErrors.notFound(`Project not found: ${slug}`);
      }
      const baselines = await prisma.baseline.findMany({
        where: { projectId: project.id },
        select: {
          id: true,
          path: true,
          sizeBytes: true,
          uploadedAt: true,
        },
        orderBy: { path: 'asc' },
      });
      return { project: slug, baselines };
    },
  );

  app.get(
    '/baselines/:id/image',
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.params;
      const baseline = await prisma.baseline.findUnique({
        where: { id },
        select: {
          storagePath: true,
          sizeBytes: true,
          project: { select: { slug: true } },
        },
      });
      if (!baseline) {
        throw app.httpErrors.notFound('Baseline not found');
      }
      if (!(await authorizeProjectUpload(req, baseline.project.slug))) {
        throw app.httpErrors.unauthorized(
          'Bearer token does not match this baseline\'s project.',
        );
      }
      const abs = resolveDataPath(baseline.storagePath);
      try {
        await fs.access(abs);
      } catch {
        throw app.httpErrors.notFound('Baseline image missing on disk');
      }
      reply.header('Content-Type', 'image/png');
      if (baseline.sizeBytes) {
        reply.header('Content-Length', String(baseline.sizeBytes));
      }
      return reply.send(createReadStream(abs));
    },
  );
}
