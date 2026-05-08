# --- Builder ----------------------------------------------------------------
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /repo

# Workspace manifests first.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.build.json ./packages/core/
COPY apps/viewer/package.json ./apps/viewer/

RUN pnpm install --frozen-lockfile

# Sources.
COPY packages/core/src ./packages/core/src
COPY apps/viewer ./apps/viewer

# Build the shared workspace package so its dist/ is present before viewer
# imports it (next build also reads through @visualize/core via
# transpilePackages, but we keep dist/ around for runtime parity).
RUN pnpm --filter @visualize/core build

RUN pnpm prisma generate --schema=./prisma/schema.prisma

# Build Next.js (standalone output for slim runtime).
RUN pnpm --filter @visualize/viewer build

# --- Runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl ca-certificates
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Next.js standalone output bundles only what's needed (incl. Prisma engines
# via outputFileTracingIncludes in next.config.mjs).
COPY --from=builder /repo/apps/viewer/.next/standalone ./
COPY --from=builder /repo/apps/viewer/.next/static ./apps/viewer/.next/static
COPY --from=builder /repo/apps/viewer/public ./apps/viewer/public

EXPOSE 3000
CMD ["node", "apps/viewer/server.js"]
