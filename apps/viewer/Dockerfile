# --- Builder ----------------------------------------------------------------
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo

# Copy workspace files first for better layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY prisma ./prisma
COPY packages ./packages
COPY apps/viewer ./apps/viewer

# Install only the deps needed for the viewer + workspace deps.
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm prisma generate --schema=./prisma/schema.prisma

# Build Next.js (standalone output for slim runtime).
RUN pnpm --filter @visualize/viewer build

# --- Runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
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
