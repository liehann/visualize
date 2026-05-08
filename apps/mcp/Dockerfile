# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /repo

# Manifests first for layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.build.json ./packages/core/
COPY apps/mcp/package.json ./apps/mcp/

RUN pnpm install --frozen-lockfile

# Sources.
COPY packages/core/src ./packages/core/src
COPY apps/mcp ./apps/mcp

# Build the shared workspace package first.
RUN pnpm --filter @visualize/core build

# Prisma client.
RUN pnpm prisma generate --schema=prisma/schema.prisma

# Build the mcp service.
RUN pnpm --filter @visualize/mcp build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runner

# OpenSSL is needed for Prisma's query engine binary (libssl.so.3).
RUN apk add --no-cache openssl ca-certificates

WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

COPY --from=builder /repo /app

WORKDIR /app/apps/mcp

EXPOSE 5000

CMD ["node", "dist/server.js"]
