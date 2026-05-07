# @visualize/ingest

Fastify HTTP service that accepts CI uploads of Playwright report bundles and
golden screenshots. Authed with `Authorization: Bearer $API_SECRET`.

## Env

| Var            | Required | Default       | Notes                                    |
| -------------- | -------- | ------------- | ---------------------------------------- |
| `DATABASE_URL` | yes      | —             | Postgres URL for Prisma                  |
| `API_SECRET`   | yes      | —             | Bearer token CI must send                |
| `DATA_DIR`     | yes      | —             | Filesystem root for reports + baselines  |
| `PORT`         | no       | `4000`        | HTTP port                                |
| `NODE_ENV`     | no       | `development` | `production` switches to JSON logs       |

## Endpoints

### `GET /healthz`

Unauthenticated. Returns `{ ok: true, service: 'ingest' }`.

### `POST /runs`

Multipart form upload of a Playwright report.

Fields:

- `meta` — JSON string matching `RunUploadMetadataSchema`:
  - `projectSlug` (required)
  - `projectName?`
  - `commitSha?`, `branch?`, `prNumber?`
  - `ciProvider?`, `ciRunUrl?`
- `bundle` — zip of the contents of `playwright-report/` (must contain
  `report.json` at the root, plus `data/`, `trace/`, `resources/`).

Response `201`:

```json
{
  "id": "...",
  "url": "/runs/...",
  "status": "passed",
  "totals": { "total": 42, "passed": 40, "failed": 1, "flaky": 1, "skipped": 0 }
}
```

Example:

```bash
curl -fsS https://ingest.example.com/runs \
  -H "Authorization: Bearer $API_SECRET" \
  -F 'meta={"projectSlug":"web","commitSha":"abc1234","branch":"main"};type=application/json' \
  -F "bundle=@playwright-report.zip"
```

### `POST /baselines`

Multipart form upload of a single golden PNG. The `meta` field MUST be sent
before the `image` file.

Fields:

- `meta` — JSON string matching `BaselineUploadMetadataSchema`:
  - `projectSlug` (required)
  - `projectName?`
  - `name` (required) — logical baseline identifier (e.g. `homepage-hero`)
  - `browser?`, `platform?`
  - `commitSha?`, `branch?`
- `image` — single PNG file.

Response `200`:

```json
{ "id": "...", "storagePath": "baselines/<projectId>/...png", "projectId": "..." }
```

Example:

```bash
curl -fsS https://ingest.example.com/baselines \
  -H "Authorization: Bearer $API_SECRET" \
  -F 'meta={"projectSlug":"web","name":"homepage-hero","browser":"chromium","platform":"linux"};type=application/json' \
  -F "image=@homepage-hero.png"
```

## Scripts

```bash
pnpm --filter @visualize/ingest dev        # tsx watch
pnpm --filter @visualize/ingest build      # tsc -> dist/
pnpm --filter @visualize/ingest start      # node dist/server.js
pnpm --filter @visualize/ingest typecheck  # tsc --noEmit
```
