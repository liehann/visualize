# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /repo

# Copy workspace manifests first for better layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY tsconfig.base.json ./
COPY prisma ./prisma
COPY packages/core/package.json ./packages/core/package.json
COPY apps/ingest/package.json ./apps/ingest/package.json

# Install all dependencies (workspace)
RUN pnpm install --frozen-lockfile

# Now copy sources
COPY packages/core ./packages/core
COPY apps/ingest ./apps/ingest

# Generate Prisma client against the root schema
RUN pnpm prisma generate --schema=prisma/schema.prisma

# Compile the ingest service
RUN pnpm --filter @visualize/ingest build

# Prune dev deps from the workspace tree
RUN pnpm --filter @visualize/ingest deploy --prod /out

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

# App + production node_modules from the deploy output
COPY --from=builder /out/dist ./dist
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /out/package.json ./package.json

# Prisma needs the schema available at runtime to locate engines reliably
COPY --from=builder /repo/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/server.js"]
