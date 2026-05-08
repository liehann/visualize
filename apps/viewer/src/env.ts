import { z } from 'zod';

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  DATA_DIR: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  AUTH_URL: z.string().url().optional(),
  AUTHENTIK_ISSUER: z.string().url(),
  AUTHENTIK_CLIENT_ID: z.string().min(1),
  AUTHENTIK_CLIENT_SECRET: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEV_AUTH_BYPASS: z.string().optional(),
  // Public URL of the ingest service. Surfaced in the project setup screen
  // so users see the real hostname instead of "ingest.your-domain".
  INGEST_PUBLIC_URL: z.string().url().optional(),
  // GitHub repo of the deployed Visualize instance, used to populate the
  // `uses:` line of the workflow snippet (e.g. "liehann/visualize").
  VISUALIZE_REPO: z.string().optional(),
});

type Env = z.infer<typeof Schema>;

// Skip strict validation during `next build` (the page-data collection step
// imports route modules but has no runtime env). The values returned here
// never execute — `next build` only inspects shapes.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

function readEnv(): Env {
  if (isBuildPhase) {
    return {
      DATABASE_URL: 'postgresql://build:build@build/build',
      DATA_DIR: '/tmp',
      AUTH_SECRET: 'build-time-placeholder-build-time-placeholder',
      AUTH_URL: undefined,
      AUTHENTIK_ISSUER: 'https://build.invalid/',
      AUTHENTIK_CLIENT_ID: 'build',
      AUTHENTIK_CLIENT_SECRET: 'build',
      NODE_ENV: (process.env.NODE_ENV as Env['NODE_ENV']) ?? 'production',
      DEV_AUTH_BYPASS: undefined,
      INGEST_PUBLIC_URL: undefined,
      VISUALIZE_REPO: undefined,
    };
  }
  return Schema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    DATA_DIR: process.env.DATA_DIR,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    AUTHENTIK_ISSUER: process.env.AUTHENTIK_ISSUER,
    AUTHENTIK_CLIENT_ID: process.env.AUTHENTIK_CLIENT_ID,
    AUTHENTIK_CLIENT_SECRET: process.env.AUTHENTIK_CLIENT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS,
    INGEST_PUBLIC_URL:
      process.env.INGEST_PUBLIC_URL ?? process.env.SERVICE_URL_INGEST,
    VISUALIZE_REPO: process.env.VISUALIZE_REPO,
  });
}

export const env: Env = readEnv();
