import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Trace from the monorepo root so Prisma engines and workspace deps land
  // in the standalone bundle.
  outputFileTracingRoot: resolve(__dirname, '../..'),
  outputFileTracingIncludes: {
    '*': [
      '../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/*.node',
      '../../node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/*.node',
      './node_modules/.prisma/client/*.node',
      './node_modules/@prisma/engines/*.node',
    ],
  },
  transpilePackages: ['@visualize/core'],
};

export default nextConfig;
