import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import { loadEnv } from './env.js';
import { requireBearer } from './auth.js';
import { registerRoutes } from './routes/index.js';
import { ensureDir, resolveDataPath } from '@visualize/core/storage';
import { prisma } from '@visualize/core/db';
import { assertDataDirWritable } from '@visualize/core/data_dir_check';

async function main(): Promise<void> {
  const env = loadEnv();
  // Make DATA_DIR visible to @visualize/core/storage helpers.
  process.env.DATA_DIR = env.DATA_DIR;

  const isProd = env.NODE_ENV === 'production';

  const app = Fastify({
    logger: isProd
      ? { level: 'info' }
      : {
          level: 'debug',
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
          },
        },
    bodyLimit: 1024 * 1024, // non-multipart only; multipart has its own limit
    disableRequestLogging: false,
    trustProxy: true,
  });

  // Make sure DATA_DIR exists (and the staging dir for run uploads).
  await ensureDir(resolveDataPath('.'));
  await ensureDir(resolveDataPath('_uploads'));

  await app.register(sensible);
  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500 MB
      files: 1,
      fields: 20,
      // Allow meta JSON up to 64KB
      fieldSize: 64 * 1024,
    },
  });

  app.addHook('onRequest', requireBearer(env.API_SECRET));

  app.get('/healthz', async () => ({ ok: true, service: 'ingest' }));

  await registerRoutes(app);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await prisma.$disconnect();
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exitCode = 1;
    } finally {
      process.exit();
    }
  };
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  // Fail-fast on misconfigured volume mounts. A read-only mount or
  // wrong DATA_DIR would otherwise surface as cryptic ENOENT/EROFS at
  // first ingest — better to refuse to start with a clear message.
  try {
    await assertDataDirWritable(env.DATA_DIR);
  } catch (err) {
    app.log.error({ err }, 'DATA_DIR write check failed');
    process.exit(1);
  }

  try {
    await app.listen({ host: '0.0.0.0', port: env.PORT });
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

void main();
