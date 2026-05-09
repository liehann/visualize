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

There's a composite GitHub Action at the repo root (`action.yml`).
One block in your workflow:

```yaml
- run: npx playwright test
  continue-on-error: true

- uses: liehann/visualize@main
  if: always()
  with:
    url: ${{ vars.VISUALIZE_URL }}            # ingest, e.g. https://visualize-api.example.com
    viewer-url: ${{ vars.VISUALIZE_VIEWER_URL }}  # web, e.g. https://visualize.example.com
    secret: ${{ secrets.VISUALIZE_API_SECRET }}
    project: my-app
    # baseline-path: ./tests/__snapshots__    # optional
```

> Workflow needs `permissions: { pull-requests: write, statuses: write }`
> for the PR comment + commit status to work with the default
> `${{ github.token }}`. Pass a different `github-token` for fork PRs.

The action auto-detects branch, PR number, commit, and CI run URL from
the GitHub Actions context. Bundles `./playwright-report/` (or whatever
`report-path` points at), POSTs to `<url>/runs`. Adds an annotation to
the workflow with a link to the new run.

When `viewer-url` is set and the workflow runs on a PR, the action
upserts a sticky PR comment with the run summary, total counts, and a
deep-link to the viewer — no need to chase down the URL by hand. Set
`comment-on-pr: false` to disable.

The action also sets a `visualize/visual-diffs` commit status:
**pending** when the run has unreviewed visual diffs (which blocks
merge under branch protection — humans must approve via the viewer
before the next CI run flips it to **success**), or **success** when
there were no visual changes. Set `set-status-check: false` to disable.

Don't want the upload to ever fail your CI? Default `fail-on-error: false`
means a Visualize hiccup is a warning, not a workflow failure.

A canned example workflow lives at `.github/workflows/example.yml`.

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

This is the canonical deploy target — `docker-compose.yml` is shaped for
Coolify's compose deploy. Three services on three hostnames, healthchecks
wired up, no production Postgres bundled.

### 1. Pre-flight on your shared Postgres

```sql
CREATE ROLE visualize WITH LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE visualize OWNER visualize;
GRANT ALL PRIVILEGES ON DATABASE visualize TO visualize;
```

Note the URL: `postgresql://visualize:CHANGE_ME@<host>:5432/visualize?schema=public`.

### 2. Authentik OIDC

In Authentik:

1. Create an **OAuth2/OpenID Provider**.
   - Client type: Confidential.
   - Redirect URI: `https://visualize.<your-domain>/api/auth/callback/authentik`.
   - Scopes: `openid`, `email`, `profile`.
2. Create an **Application** bound to that Provider. Note the
   **issuer** URL (looks like
   `https://authentik.<your-domain>/application/o/visualize/`),
   the **client ID**, and the **client secret**.
3. Optionally bind the Application to specific Authentik groups so only
   the right people can sign in.

### 3. Generate secrets locally

```bash
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # API_SECRET
openssl rand -hex 32   # MCP_SECRET
```

### 4. Add the stack to Coolify

1. **New Resource → Docker Compose** → point at this repo + branch.
2. **Environment variables** (use the values from steps 1–3):

   ```
   DATABASE_URL=postgresql://visualize:...@your-pg-host:5432/visualize?schema=public
   API_SECRET=<from step 3>
   MCP_SECRET=<from step 3>
   AUTH_SECRET=<from step 3>
   VIEWER_URL=https://visualize.<your-domain>
   AUTHENTIK_ISSUER=https://authentik.<your-domain>/application/o/visualize/
   AUTHENTIK_CLIENT_ID=<from step 2>
   AUTHENTIK_CLIENT_SECRET=<from step 2>
   ```
3. **Domain mapping** (one per service). Use **first-level** subdomains
   only — Cloudflare's free Universal SSL doesn't cover deeper nesting,
   so `api.visualize.<your-domain>` would need a paid plan. Namespace
   the names so they don't collide with future apps:

   | Service   | Internal port | Public hostname                  |
   |-----------|---------------|----------------------------------|
   | `viewer`  | `3000`        | `visualize.<your-domain>`        |
   | `ingest`  | `4000`        | `visualize-api.<your-domain>`    |
   | `mcp`     | `5000`        | `visualize-mcp.<your-domain>`    |

4. **Deploy**. Coolify provisions Let's Encrypt per hostname and runs the
   healthchecks defined in `docker-compose.yml`.

### 5. Run the migration on first deploy

The image doesn't auto-migrate (deliberate — migrations should be a
conscious step). After the first deploy:

```bash
# From your laptop, against the production DB
DATABASE_URL='postgresql://visualize:...@your-pg-host:5432/visualize?schema=public' \
  pnpm prisma migrate deploy --schema=prisma/schema.prisma
```

### 6. Smoke-test

```bash
# Healthchecks (no auth)
curl -f https://visualize-api.<your-domain>/healthz
curl -f https://visualize.<your-domain>/api/health
curl -f https://visualize-mcp.<your-domain>/healthz

# Try a bearer-protected endpoint with the wrong secret -> 401
curl -i -X POST https://visualize-api.<your-domain>/runs \
  -H 'Authorization: Bearer nope'
```

Then: open `https://visualize.<your-domain>` in a browser, sign in via
Authentik, and you should land on an empty Projects page. Wire the
GitHub Action into a real repo and the first run will populate it.

The compose file uses a named volume `visualize-data` for asset storage,
so uploaded reports survive restarts and redeploys.

## License

This is a customer-owned project. License: not yet decided.
