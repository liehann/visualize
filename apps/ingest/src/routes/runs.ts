import { createWriteStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { prisma } from '@visualize/core/db';
import { extractZip, ensureDir, resolveDataPath } from '@visualize/core/storage';
import { flattenSpecs, loadReport, rollupRun } from '@visualize/core/parser';
import { RunUploadMetadataSchema } from '@visualize/core/types';
import type { Prisma } from '@prisma/client';
import { authorizeProjectUpload } from '../auth.js';

type RunMeta = ReturnType<typeof RunUploadMetadataSchema.parse>;

type ParsedFields = {
  meta: RunMeta;
  bundle: MultipartFile;
};

async function parseMultipart(req: FastifyRequest): Promise<{
  meta: RunMeta;
  bundleTmpPath: string;
}> {
  const parts = req.parts();
  let metaRaw: string | undefined;
  let bundleTmpPath: string | undefined;

  // Reserve a temp path for the zip up-front, in case the bundle field shows
  // up before meta. We always write under DATA_DIR/_uploads.
  const uploadsDirRel = '_uploads';
  await ensureDir(resolveDataPath(uploadsDirRel));
  const tmpRel = path.posix.join(uploadsDirRel, `${randomUUID()}.zip`);
  const tmpAbs = resolveDataPath(tmpRel);

  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname !== 'bundle') {
        // Drain unknown file fields so the stream doesn't hang.
        await part.toBuffer();
        continue;
      }
      if (bundleTmpPath) {
        throw req.server.httpErrors.badRequest('Multiple `bundle` files');
      }
      await pipeline(part.file, createWriteStream(tmpAbs));
      if (part.file.truncated) {
        await fs.unlink(tmpAbs).catch(() => undefined);
        throw req.server.httpErrors.payloadTooLarge('bundle exceeds size limit');
      }
      bundleTmpPath = tmpAbs;
    } else if (part.fieldname === 'meta') {
      metaRaw = typeof part.value === 'string' ? part.value : String(part.value);
    }
  }

  if (!metaRaw) {
    if (bundleTmpPath) await fs.unlink(bundleTmpPath).catch(() => undefined);
    throw req.server.httpErrors.badRequest('Missing `meta` field');
  }
  if (!bundleTmpPath) {
    throw req.server.httpErrors.badRequest('Missing `bundle` file');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(metaRaw);
  } catch {
    await fs.unlink(bundleTmpPath).catch(() => undefined);
    throw req.server.httpErrors.badRequest('`meta` must be valid JSON');
  }
  const result = RunUploadMetadataSchema.safeParse(parsedJson);
  if (!result.success) {
    await fs.unlink(bundleTmpPath).catch(() => undefined);
    throw req.server.httpErrors.badRequest(
      `Invalid meta: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  return { meta: result.data, bundleTmpPath };
}

async function rmrf(absPath: string): Promise<void> {
  await fs.rm(absPath, { recursive: true, force: true }).catch(() => undefined);
}

export async function registerRunsRoute(app: FastifyInstance): Promise<void> {
  app.post('/runs', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.isMultipart()) {
      throw app.httpErrors.unsupportedMediaType('Expected multipart/form-data');
    }

    const { meta, bundleTmpPath } = await parseMultipart(req);

    if (!(await authorizeProjectUpload(req, meta.projectSlug))) {
      await fs.unlink(bundleTmpPath).catch(() => undefined);
      throw app.httpErrors.unauthorized(
        'Bearer token does not match this project. Generate a per-project token from the viewer or use the global API_SECRET.',
      );
    }

    const runId = randomUUID();
    const storagePath = `runs/${runId}/`;
    const bundleAbs = resolveDataPath(storagePath);

    try {
      // 1. Extract the bundle into runs/<runId>/
      await extractZip(bundleTmpPath, storagePath);

      // 2. Parse the report.
      const report = await loadReport(storagePath);
      const specs = flattenSpecs(report, storagePath);
      const rollup = rollupRun(specs);

      // 3. Persist everything atomically.
      const project = await prisma.project.upsert({
        where: { slug: meta.projectSlug },
        update: meta.projectName ? { name: meta.projectName } : {},
        create: {
          slug: meta.projectSlug,
          name: meta.projectName ?? meta.projectSlug,
        },
      });

      const finishedAt = new Date();

      const created = await prisma.$transaction(async (tx) => {
        const run = await tx.run.create({
          data: {
            id: runId,
            projectId: project.id,
            commitSha: meta.commitSha,
            branch: meta.branch,
            prNumber: meta.prNumber,
            ciProvider: meta.ciProvider,
            ciRunUrl: meta.ciRunUrl,
            status: rollup.status,
            finishedAt,
            durationMs: rollup.durationMs,
            totalTests: rollup.totalTests,
            passedTests: rollup.passedTests,
            failedTests: rollup.failedTests,
            flakyTests: rollup.flakyTests,
            skippedTests: rollup.skippedTests,
            storagePath,
            rawConfig: (report.config ?? null) as Prisma.InputJsonValue,
            metadata: (report.stats ?? null) as Prisma.InputJsonValue,
          },
        });

        for (const spec of specs) {
          await tx.testCase.create({
            data: {
              runId: run.id,
              titlePath: spec.titlePath,
              title: spec.title,
              file: spec.file,
              line: spec.line,
              column: spec.column,
              projectName: spec.projectName,
              status: spec.status,
              expectedStatus: spec.expectedStatus,
              durationMs: spec.durationMs,
              results: {
                create: spec.results.map((r) => ({
                  retry: r.retry,
                  status: r.status,
                  durationMs: r.durationMs,
                  startedAt: r.startedAt,
                  workerIndex: r.workerIndex,
                  errorMessage: r.errorMessage,
                  errorStack: r.errorStack,
                  errorSnippet: r.errorSnippet,
                  stdout: r.stdout,
                  stderr: r.stderr,
                  attachments: {
                    create: r.attachments.map((a) => ({
                      name: a.name,
                      contentType: a.contentType,
                      storagePath: a.storagePath,
                      sizeBytes: a.sizeBytes,
                      kind: a.kind,
                      snapshotKind: a.snapshotKind,
                      snapshotName: a.snapshotName,
                    })),
                  },
                })),
              },
            },
          });
        }

        return run;
      });

      // 4. Cleanup temp upload.
      await fs.unlink(bundleTmpPath).catch(() => undefined);

      reply.code(201);
      return {
        id: created.id,
        url: `/runs/${created.id}`,
        status: created.status,
        totals: {
          total: created.totalTests,
          passed: created.passedTests,
          failed: created.failedTests,
          flaky: created.flakyTests,
          skipped: created.skippedTests,
        },
      };
    } catch (err) {
      // Cleanup partial extract + temp zip on failure.
      await rmrf(bundleAbs);
      await fs.unlink(bundleTmpPath).catch(() => undefined);
      req.log.error({ err }, 'failed to ingest run');
      if ((err as { statusCode?: number }).statusCode) throw err;
      throw app.httpErrors.internalServerError(
        `Failed to process run upload: ${(err as Error).message}`,
      );
    }
  });
}
