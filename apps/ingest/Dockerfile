# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /repo

# Manifests first for layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.build.json ./packages/core/
COPY apps/ingest/package.json ./apps/ingest/

RUN pnpm install --frozen-lockfile

# Sources.
COPY packages/core/src ./packages/core/src
COPY apps/ingest ./apps/ingest

# Build the shared workspace package first so its dist/ exists before
# anything tries to import @visualize/core at runtime.
RUN pnpm --filter @visualize/core build

# Prisma client.
RUN pnpm prisma generate --schema=prisma/schema.prisma

# Build the ingest service.
RUN pnpm --filter @visualize/ingest build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runner

# OpenSSL is needed for Prisma's query engine binary (libssl.so.3).
RUN apk add --no-cache openssl ca-certificates

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

# Ship the whole built workspace; preserves pnpm's @visualize/core
# symlink under apps/ingest/node_modules so resolution Just Works.
COPY --from=builder /repo /app

WORKDIR /app/apps/ingest

EXPOSE 4000

CMD ["node", "dist/server.js"]
