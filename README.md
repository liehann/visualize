# visualize

Self-hosted Playwright report viewer + visual diff tool. A free/OSS alternative
to VRT-style services that:

- Ingests **the full Playwright report bundle** (videos, traces, screenshots,
  errors, stdout/stderr) — not just screenshots.
- Renders a **clean, dense viewer UI** with branch + PR badges, side-by-side
  actual / expected / diff, and one-click approve **per screenshot**.
- Exposes an **MCP server** so Claude can fetch screenshots and diffs while
  investigating a failing PR.
- Stores annotations (rectangles / arrows / circles / text) as structured
  JSON so Claude can read and write them programmatically.

## Architecture

Three services, one docker-compose, designed for Coolify deploy with a
hostname per service:

| Service     | Hostname (suggested)     | Auth                    | Purpose                                         |
|-------------|--------------------------|-------------------------|-------------------------------------------------|
| **ingest**  | `ingest.<your-domain>`   | Bearer `API_SECRET`     | CI uploads of reports + golden screenshots      |
| **viewer**  | `visualize.<your-domain>`| Authentik OIDC (cookie) | Web UI; per-screenshot approve                  |
| **mcp**     | `mcp.<your-domain>`      | Bearer `MCP_SECRET`     | MCP server for Claude                           |

Postgres is **external** — run it on your shared instance and point
`DATABASE_URL` at a `visualize` user/database. A `dev`-profile Postgres is
included in `docker-compose.yml` for local development only.

```
visualize/
├── docker-compose.yml          # 3 services + dev-profile postgres
├── prisma/schema.prisma        # shared schema
├── packages/core/              # parser, storage, db, types
├── apps/
│   ├── ingest/                 # Fastify, /runs + /baselines
│   ├── viewer/                 # Next.js + Tailwind + shadcn-style + Auth.js
│   └── mcp/                    # MCP HTTP server
└── scripts/upload-report.ts    # CI uploader (no deps)
```

## Quick start (local dev)

```bash
# 1. Install workspace deps
pnpm install

# 2. Configure env
cp .env.example .env
# Edit DATABASE_URL to point at the dev postgres (see below).

# 3. Start dev Postgres
docker compose --profile dev up -d
# DATABASE_URL=postgresql://visualize:visualize@localhost:5432/visualize?schema=public

# 4. Apply schema
pnpm prisma migrate dev

# 5. Run services in separate terminals
pnpm dev:ingest                      # http://localhost:4000
pnpm dev:viewer                      # http://localhost:3000
pnpm --filter @visualize/mcp dev     # http://localhost:5000

# 6. Dogfood: run viewer Playwright tests, then upload the report
pnpm --filter @visualize/viewer test
pnpm upload \
  --url http://localhost:4000 \
  --secret $API_SECRET \
  --project visualize-viewer \
  --branch dev \
  --report ./apps/viewer/playwright-report
```

## CI integration

In your repo's CI, after Playwright runs:

```yaml
- run: npx playwright test
- name: Upload to Visualize
  if: always()
  run: |
    npx tsx scripts/upload-report.ts \
      --url https://ingest.your-domain \
      --secret ${{ secrets.VISUALIZE_API_SECRET }} \
      --project web \
      --branch ${{ github.head_ref || github.ref_name }} \
      --pr ${{ github.event.pull_request.number }} \
      --commit ${{ github.sha }} \
      --ci-provider github \
      --ci-run-url ${{ github.event.repository.html_url }}/actions/runs/${{ github.run_id }} \
      --report ./playwright-report
```

Push golden screenshots the same way:

```bash
npx tsx scripts/upload-report.ts \
  --url https://ingest.your-domain \
  --secret $VISUALIZE_API_SECRET \
  --project web \
  --baseline-name homepage-hero \
  --browser chromium \
  --platform linux \
  --baseline ./snapshots/homepage-hero.png
```

## Authentik OIDC setup

In Authentik:
1. Create an OAuth2/OpenID **Provider**. Redirect URI:
   `https://visualize.<your-domain>/api/auth/callback/authentik`.
2. Create an **Application** bound to that Provider.
3. Copy the issuer URL, client ID, and client secret into the viewer's
   environment as `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`,
   `AUTHENTIK_CLIENT_SECRET`.

## MCP (for Claude)

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "visualize": {
      "type": "http",
      "url": "https://mcp.<your-domain>/mcp",
      "headers": { "Authorization": "Bearer YOUR_MCP_SECRET" }
    }
  }
}
```

Tools exposed:
- `list_projects`, `list_runs`, `list_runs_for_pr`, `list_runs_for_commit`
- `get_run`, `list_failed_tests`, `get_test_failure`
- `get_attachment` (returns ≤2MB images as base64), `get_snapshot_diff`
- `list_annotations`, `add_annotation` (Claude can mark up screenshots)

## Coolify deploy

1. Push the repo to a Coolify-connected git provider.
2. Add a new resource → Docker Compose. Point at this repo.
3. In the Coolify UI for the deployed stack, set environment variables from
   `.env.example`. Don't include the dev-profile Postgres password.
4. Map a domain to each service:
   - `ingest.<your-domain>` → `ingest:4000`
   - `visualize.<your-domain>` → `viewer:3000`
   - `mcp.<your-domain>` → `mcp:5000`
5. Deploy. Coolify provisions Let's Encrypt certs per hostname.

The compose file uses a named volume `visualize-data` for storage, so
uploaded reports survive restarts. Postgres is intentionally **not** in
the production compose — point `DATABASE_URL` at your shared instance.

## License

This is a customer-owned project. License: not yet decided.
