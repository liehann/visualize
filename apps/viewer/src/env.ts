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
});

export const env = Schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DATA_DIR: process.env.DATA_DIR,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL,
  AUTHENTIK_ISSUER: process.env.AUTHENTIK_ISSUER,
  AUTHENTIK_CLIENT_ID: process.env.AUTHENTIK_CLIENT_ID,
  AUTHENTIK_CLIENT_SECRET: process.env.AUTHENTIK_CLIENT_SECRET,
  NODE_ENV: process.env.NODE_ENV,
});
