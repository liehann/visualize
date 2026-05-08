import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { prisma } from '@visualize/core/db';
import { resolveDataPath, writeStreamToDataDir } from '@visualize/core/storage';
import { BaselineUploadMetadataSchema } from '@visualize/core/types';
import { authorizeProjectUpload } from '../auth.js';

type BaselineMeta = ReturnType<typeof BaselineUploadMetadataSchema.parse>;

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

async function parseMultipart(req: FastifyRequest): Promise<{
  meta: BaselineMeta;
  imageStream: MultipartFile['file'];
  imageContentType?: string;
}> {
  const parts = req.parts();
  let metaRaw: string | undefined;
  let imageFile: MultipartFile | undefined;

  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname !== 'image') {
        await part.toBuffer();
        continue;
      }
      if (imageFile) {
        throw req.server.httpErrors.badRequest('Multiple `image` files');
      }
      imageFile = part;
      // We must break out of the loop to avoid the iterator advancing past
      // the file before we've consumed it. Validate meta first if present.
      break;
    } else if (part.fieldname === 'meta') {
      metaRaw = typeof part.value === 'string' ? part.value : String(part.value);
    }
  }

  if (!imageFile) {
    throw req.server.httpErrors.badRequest('Missing `image` file');
  }
  if (!metaRaw) {
    // Drain the file before raising.
    imageFile.file.resume();
    throw req.server.httpErrors.badRequest(
      'Missing `meta` field (must appear before the `image` file)',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(metaRaw);
  } catch {
    imageFile.file.resume();
    throw req.server.httpErrors.badRequest('`meta` must be valid JSON');
  }
  const result = BaselineUploadMetadataSchema.safeParse(parsedJson);
  if (!result.success) {
    imageFile.file.resume();
    throw req.server.httpErrors.badRequest(
      `Invalid meta: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  return {
    meta: result.data,
    imageStream: imageFile.file,
    imageContentType: imageFile.mimetype,
  };
}

export async function registerBaselinesRoute(app: FastifyInstance): Promise<void> {
  app.post('/baselines', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.isMultipart()) {
      throw app.httpErrors.unsupportedMediaType('Expected multipart/form-data');
    }

    const { meta, imageStream } = await parseMultipart(req);

    if (!(await authorizeProjectUpload(req, meta.projectSlug))) {
      imageStream.resume();
      throw app.httpErrors.unauthorized(
        'Bearer token does not match this project. Generate a per-project token from the viewer or use the global API_SECRET.',
      );
    }

    // Upsert project
    const project = await prisma.project.upsert({
      where: { slug: meta.projectSlug },
      update: meta.projectName ? { name: meta.projectName } : {},
      create: {
        slug: meta.projectSlug,
        name: meta.projectName ?? meta.projectSlug,
      },
    });

    const safeName = sanitize(meta.name);
    const browserSeg = sanitize(meta.browser ?? 'any');
    const platformSeg = sanitize(meta.platform ?? 'any');
    const fileName = `${safeName}__${browserSeg}__${platformSeg}.png`;
    const storagePath = path.posix.join('baselines', project.id, fileName);

    try {
      await writeStreamToDataDir(imageStream, storagePath);
    } catch (err) {
      req.log.error({ err }, 'failed to persist baseline image');
      throw app.httpErrors.internalServerError(
        `Failed to write baseline: ${(err as Error).message}`,
      );
    }

    const abs = resolveDataPath(storagePath);
    let sizeBytes: number | undefined;
    try {
      const stat = await fs.stat(abs);
      sizeBytes = stat.size;
    } catch {
      sizeBytes = undefined;
    }

    // Best-effort PNG dimension parsing. PNG header layout:
    //   bytes 0..7  = signature
    //   bytes 8..15 = IHDR length + type
    //   bytes 16..19 = width  (big-endian uint32)
    //   bytes 20..23 = height (big-endian uint32)
    let width: number | undefined;
    let height: number | undefined;
    try {
      const fd = await fs.open(abs, 'r');
      try {
        const buf = Buffer.alloc(24);
        const { bytesRead } = await fd.read(buf, 0, 24, 0);
        if (
          bytesRead >= 24 &&
          buf[0] === 0x89 &&
          buf[1] === 0x50 &&
          buf[2] === 0x4e &&
          buf[3] === 0x47
        ) {
          width = buf.readUInt32BE(16);
          height = buf.readUInt32BE(20);
        }
      } finally {
        await fd.close();
      }
    } catch {
      // ignore — width/height stay undefined
    }

    const browser = meta.browser ?? 'any';
    const platform = meta.platform ?? 'any';

    const baseline = await prisma.baseline.upsert({
      where: {
        projectId_name_browser_platform: {
          projectId: project.id,
          name: meta.name,
          browser,
          platform,
        },
      },
      update: {
        storagePath,
        sizeBytes,
        width,
        height,
        commitSha: meta.commitSha,
        branch: meta.branch,
        uploadedAt: new Date(),
      },
      create: {
        projectId: project.id,
        name: meta.name,
        browser,
        platform,
        storagePath,
        sizeBytes,
        width,
        height,
        commitSha: meta.commitSha,
        branch: meta.branch,
      },
    });

    reply.code(200);
    return {
      id: baseline.id,
      storagePath: baseline.storagePath,
      projectId: baseline.projectId,
    };
  });
}
