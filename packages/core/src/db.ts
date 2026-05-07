import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __visualizePrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__visualizePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__visualizePrisma = prisma;
}

export type { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
