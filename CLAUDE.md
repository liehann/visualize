# Visualize — project context for Claude

> This file is the source of truth for picking up work between sessions. Read
> it first. The customer (the human) clears sessions periodically and asks
> Claude to resume. Everything Claude needs to continue without rebriefing
> should live here.

## Roles & autonomy

### Customer (stakeholder)
- Provides high-level direction and the north star of "what matters."
- Reviews shipped work, points out things that suck.
- Does **not** design, implement, or pick libraries.

### Claude (the team)
Owns the entire product lifecycle:
- **Product management** — what to build next, in what order. The customer
  is the stakeholder, not the PM.
- **UX and UI design** — visual style, interaction model, information
  architecture. No design-by-committee.
- **Engineering** — architecture, libraries, naming, file layout,
  refactors.
- **QA / test** — testing strategy, coverage, what to automate.
- **Quality & maintenance** — keeps the system healthy. **No outages.**
  This means: healthchecks, graceful failure modes, idempotent operations,
  no silent data loss, recoverable migrations, useful logs, and bugs fixed
  at the root not patched at the edges.
- **Operations** — Dockerfiles, compose, deploy story, rollback story.

### What requires customer input
- **Feature prioritization** when there's a real fork in the road. Surface
  2–3 options and the tradeoff in one sentence each.
- **Hard constraint changes** (budget, hosting, must-have features).
- **Anything that might be irreversible or surprising** to the stakeholder.

### What does NOT require customer input
- Library choices, framework versions, architectural patterns.
- UX/UI decisions, color palette, typography, layout.
- Test strategy, coverage targets, which tests to write.
- Internal API shapes, file/folder layout, naming.
- Refactors and cleanups that improve maintainability.
- Order of operations within an agreed feature.

**Default stance: decide and proceed.** Show the result; the customer can
redirect.

## Mission

A self-hosted alternative to VRT (visual regression testing tools) with a
better viewer for Playwright reports. Built around three observations:

1. VRT-style tools usually only ingest screenshots, dropping the rich
   trace/video context Playwright produces.
2. GitHub Actions doesn't host the Playwright HTML report, so videos +
   traces from CI are effectively lost.
3. The Playwright HTML report's UI is functional but ugly and hard to
   navigate when triaging many failures.

Visualize ingests the full `playwright-report/` bundle (including
videos, traces, screenshots), stores it, and renders a clean viewer with a
per-screenshot **approve** button for visual diffs.

## Hard requirements (from the customer)

These are non-negotiable. New requirements get added by the customer; Claude
does not silently drop them.

1. **Visual diff tool.** Show actual / expected / diff screenshots
   side-by-side. **One-click approve per screenshot** (not per run, not per
   test) that promotes the actual image to the new baseline.
2. **Playwright report viewer/parser.** Better UI than the stock report.
   Must show videos, traces, screenshots, error stacks, stdout/stderr.
3. **Shared-secret API access** for CI uploads (Bearer token).
4. **OAuth login for the viewer** via **Authentik** (self-hosted OIDC).
5. **Two services in one docker-compose** so Coolify can give them different
   hostnames — `ingest.<domain>` (Bearer auth, CI-facing) and
   `visualize.<domain>` (cookie auth, web-facing). Plus a third service for
   MCP (see #10).
6. **Tailwind + shadcn/ui** for the component library. Clean UI style.
7. **Show branch + PR number** prominently on every run.
8. **CI pushes both** Playwright reports **and** golden screenshots.
9. **Drawing/annotation on screenshots** (rectangles, arrows, circles, text)
   stored as structured JSON (not rasterized) so Claude can read/write them
   programmatically.
10. **Claude-friendly: MCP server.** Claude must be able to fetch screenshots
    and diffs when investigating a failing PR.
11. **Database is external** — runs on a shared Postgres instance the
    customer manages. The compose file does **not** ship a production
    Postgres. A `dev` profile brings up a local one for development.
12. **Free/OSS only.** No paid SaaS, no commercial libraries, no managed
    services that charge.
13. **Dogfood.** Visualize must run its own Playwright tests from day one
    (capturing videos and screenshots of UI flows). Eventually those reports
    upload back into Visualize itself.

## Architecture

```
visualize/
├── docker-compose.yml          # 3 services + dev-profile postgres
├── prisma/schema.prisma        # single shared schema
├── packages/core/              # shared parser, db client, storage, types
├── apps/
│   ├── ingest/                 # Fastify, Bearer auth, /runs + /baselines
│   ├── viewer/                 # Next.js + shadcn/ui + Auth.js (Authentik)
│   └── mcp/                    # MCP HTTP server, Bearer auth
├── scripts/upload-report.ts    # CLI uploader (CI-side helper)
└── CLAUDE.md                   # this file
```

### Three services, three auth postures

| Service     | Hostname (suggested)      | Auth                      | Surface                                                                                       |
|-------------|---------------------------|---------------------------|-----------------------------------------------------------------------------------------------|
| **ingest**  | `ingest.<domain>`         | Bearer `API_SECRET`       | `POST /runs` (multipart Playwright bundle), `POST /baselines` (golden PNG), `GET /healthz`    |
| **viewer**  | `visualize.<domain>`      | Authentik OIDC (cookie)   | Read pages + `POST /api/approve/[attachmentId]` for per-screenshot approve, annotation CRUD   |
| **mcp**     | `mcp.<domain>`            | Bearer `MCP_SECRET`       | MCP Streamable-HTTP transport at `/mcp`, exposes tools listed below                            |

Why three services and not one Next.js app:
- Different auth models on the same hostname is messy. Different hostnames
  lets each service have a clean, single auth posture.
- Ingest is multipart-heavy and benefits from Fastify's streaming over
  Next.js's request handling.
- MCP has a totally different consumer (Claude) and different rotation
  cadence on its secret; cleaner to keep it separate.

### Data model (Prisma)

See `prisma/schema.prisma` for the source of truth. High level:

- `Project` — one per repo / playwright config (slug-keyed).
- `Run` — one per CI run. Carries `commitSha`, `branch`, `prNumber`,
  `ciProvider`, `ciRunUrl`, denormalized counts (passed/failed/flaky/skipped),
  rollup `status`, `storagePath` pointing at the extracted bundle.
- `TestCase` → `TestResult` → `Attachment`. Attachments classified by
  `kind` (screenshot/video/trace/text/other) and, for snapshot triplets,
  `snapshotKind` (actual/expected/diff) + `snapshotName`.
- `Baseline` — current approved golden, keyed by
  `(projectId, name, browser, platform)`.
- `Annotation` — drawings on attachments. Shape stored as JSON with
  `source` enum (human/claude/ci) for audit.

### MCP tools (for Claude)

These are how Claude investigates failing PRs:

- `list_projects`
- `list_runs` (filter by project/branch/pr/status)
- `list_runs_for_pr`, `list_runs_for_commit`
- `get_run`, `list_failed_tests`, `get_test_failure`
- `get_attachment` (returns base64 image content for screenshots ≤2MB)
- `get_snapshot_diff` (returns actual/expected/diff triplet)
- `list_annotations`, `add_annotation` (Claude can mark up screenshots)

## Conventions

- **TypeScript strict mode** everywhere. `noUncheckedIndexedAccess: true`.
- **ESM** throughout (`"type": "module"`, `.js` import suffixes for local
  files in TS).
- **Zod** for all input validation (HTTP requests, env vars).
- **No `any`** outside narrow third-party glue.
- **Don't expand dependencies** without a reason. If `node:crypto` does
  the job, use it.
- **No backwards-compat shims** during this greenfield phase. Just change
  the code.
- **No comments narrating WHAT**; comments are reserved for non-obvious
  WHY.
- **Don't write planning/decision docs** unless the customer asks. Work
  from this CLAUDE.md and the code.
- **Free/OSS only.** If something would cost money, find an alternative
  or ask.

## Quality & testing strategy

The product handles real CI uploads, real screenshots, real money in the
form of engineer time triaging failures. **No outages, no silent data
loss.** That said, a greenfield project also needs to move fast — over-
testing kills velocity. The rule is: **test what would silently corrupt
data, break the public contract, or regress UX**. Don't test trivia.

### What we test, in priority order

1. **Public contracts (high coverage).** The CI-facing endpoints
   (`POST /runs`, `POST /baselines`), the MCP tool surface, and
   `POST /api/approve/[attachmentId]`. These are what other systems and
   Claude depend on. Each contract gets a happy-path integration test +
   one failure-path test (auth rejected, malformed input).

2. **Data correctness (high coverage).** The Playwright report parser
   (`packages/core/src/parser.ts`) — wrong parsing means wrong results
   forever. Snapshot triplet detection. Run rollup math. Zip extraction
   (zip-slip safety). These get unit tests against fixture report bundles.

3. **Visual regressions on the viewer (medium, dogfooded).** The viewer
   has its own Playwright suite that takes `toHaveScreenshot()` shots of
   every key page. Reports go to Visualize, baselines live in Visualize.
   This is the dogfood loop and the canary for "did we break the UI."

4. **End-to-end smoke (medium).** A handful of tests that boot the
   full stack and round-trip an upload → viewer render → approve →
   baseline-updated. Catches integration drift.

### What we do NOT test

- Trivial UI logic that has no branching. If a component just renders
  props, the visual regression test covers it.
- Implementation details (private helpers, internal types). They change.
- Generated code (Prisma client, Next.js build output).
- Third-party libraries.

### Quality gates

- **Typecheck** must pass on every PR (`pnpm typecheck`).
- **Unit + parser tests** must pass on every PR.
- **Visual regression suite** must pass on every PR. New visual diffs
  require explicit per-screenshot approval through the viewer (the same
  flow the customer uses) — that's the whole point of the product.
- **No silent data migrations.** Every Prisma migration is reviewed;
  destructive migrations require a backup script in the same PR.

### Operational defaults (the "no outages" pact)

- All services expose `GET /healthz`. Compose healthchecks wired up.
- All inbound HTTP endpoints validate input with Zod, never trust shapes.
- All Prisma writes that span entities go through `$transaction`.
- All file operations under `DATA_DIR` go through `resolveDataPath` which
  enforces path-traversal protection.
- All bearer tokens compared with `crypto.timingSafeEqual`.
- All long-running ingest work cleans up partial state on failure.
- Logs use structured JSON in production; PII goes through `redact` rules.
- Postgres connection pool sized conservatively; queries have indexes;
  `take` limits on every list query.
- Migrations are forward-only and reversible by convention (no destructive
  data changes without a one-shot recovery plan).

### When something breaks

Root-cause it, don't paper over. If a test starts flaking, fix the test
or the underlying race — never `retry` away the symptom. If a migration
fails in prod, write a recovery migration; do not edit applied migrations.

## Local dev

```bash
# 1. Install deps (pnpm workspace)
pnpm install

# 2. Bring up dev Postgres
cp .env.example .env  # edit DATABASE_URL to point at the dev container
docker compose --profile dev up -d

# 3. Apply schema
pnpm prisma migrate dev

# 4. In separate terminals
pnpm dev:ingest   # http://localhost:4000
pnpm dev:viewer   # http://localhost:3000
pnpm --filter @visualize/mcp dev   # http://localhost:5000

# 5. Upload a sample Playwright report
pnpm upload --report ./playwright-report --project demo --branch main
```

## Build state

> Update this section every session. The customer relies on it to know
> what's done and what's next.

### Done (session 1, 2026-05-07)

Foundation:
- Monorepo skeleton (pnpm workspaces, root `package.json`, `tsconfig.base.json`).
- Prisma schema with all entities (Project, Run, TestCase, TestResult,
  Attachment, Baseline, Annotation + enums).
- `docker-compose.yml` with `ingest`, `viewer`, `mcp` services + `dev`-profile
  Postgres. Shared `visualize-data` named volume.
- `.env.example` covering all three services + dev Postgres.
- `.dockerignore` for lean Coolify builds.

`packages/core`:
- `db.ts` — Prisma client singleton.
- `storage.ts` — DATA_DIR-rooted FS helpers + zip extraction with zip-slip
  protection.
- `parser.ts` — Playwright report.json → flat ParsedSpec list with
  attachment classification (incl. snapshot triplet detection) +
  run rollup.
- `types.ts` — Zod schemas for the Playwright report shape, run/baseline
  upload metadata, and annotation shape (rect/arrow/circle/text
  discriminated union).

`apps/ingest`:
- Fastify, Bearer-token auth (constant-time compare), graceful shutdown.
- `POST /runs`: streams zip to disk, extracts, parses, persists Run +
  TestCase + TestResult + Attachment in one transaction, cleans up tmp.
- `POST /baselines`: streams PNG to baselines dir, parses IHDR for
  width/height (no extra dep), upserts Baseline.
- Multi-stage Dockerfile (corepack pnpm, prisma generate, pnpm deploy).

`apps/mcp`:
- MCP server over **Streamable HTTP** at `/mcp` (stateless mode), Bearer
  auth, `GET /healthz`.
- 11 tools: list_projects, list_runs, list_runs_for_pr,
  list_runs_for_commit, get_run, list_failed_tests, get_test_failure,
  get_attachment (≤2MB images inlined as base64), get_snapshot_diff,
  list_annotations, add_annotation.
- Hand-rolled Zod-to-JSON-Schema converter (no extra dep).
- Multi-stage Dockerfile.

`apps/viewer`:
- Next.js 15 App Router + Tailwind 3 + custom dark theme tuned for
  triage UIs. Hand-written shadcn/ui-style primitives (Button, Badge,
  Card, Tabs).
- Auth.js v5 with Authentik provider; middleware-protected routes;
  sign-in page.
- Pages: home (run list with branch/PR badges), run detail (test list,
  failed-first), test detail (error panel + snapshot diffs + attachments
  + retries).
- `<SnapshotDiff>` — side / overlay (mix-blend-difference) / diff views
  with **one-click approve** per screenshot.
- `<AnnotationOverlay>` — SVG renderer for stored shape annotations.
- API routes: `/api/auth/[...nextauth]`, `/api/files/[...path]` (auth-
  protected static serving with mime detection),
  `/api/approve/[attachmentId]` (promotes actual → Baseline),
  `/api/annotations/[attachmentId]` (GET/POST),
  `/api/annotations/by-id/[id]` (DELETE).
- Multi-stage Dockerfile (Next.js standalone output).

Dogfood:
- `playwright.config.ts` + initial smoke tests (`tests/sign-in.spec.ts`,
  `tests/health.spec.ts`). Records video on every test, screenshots on
  failure, full traces.

CLI + docs:
- `scripts/upload-report.ts` — zero-dependency uploader for both reports
  and baselines.
- Top-level `README.md` covering quick-start, CI, Authentik setup,
  Coolify deploy, MCP config.

### Pending

- **First boot.** Nothing has been `pnpm install`'d or `pnpm
  prisma migrate`'d yet — this scaffold is unverified. Next session
  should:
  1. `pnpm install`
  2. `docker compose --profile dev up -d`
  3. `pnpm prisma migrate dev` (creates initial migration)
  4. `pnpm dev:ingest` / `pnpm dev:viewer` / `pnpm --filter @visualize/mcp dev`
  5. Run `pnpm --filter @visualize/viewer test` to produce the first
     dogfood report.
  6. `pnpm upload --url http://localhost:4000 ...` to round-trip a
     report through the system.
- Likely small bugs to shake out: Auth.js v5 route handler shape, Prisma
  unique-key naming in approve route, type mismatches between viewer
  components and Prisma types.
- Nice-to-haves not yet built: drawing UI for annotations, run-vs-run
  comparison view, retention/GC, Slack notifications, embedded trace
  viewer. See Roadmap below — customer prioritizes.

### Roadmap (Claude-owned, customer prioritizes)

Open items for the customer to weigh in on. Claude owns these but won't
silently pick the order:

- **Diff thresholding.** Pixelmatch with configurable threshold +
  per-snapshot overrides; show diff % in the UI.
- **Run comparison view.** Side-by-side two runs (e.g. main vs PR) with
  only-changed-tests filter.
- **Slack/webhook notifications** when a run fails or a baseline is
  approved.
- **Retention / GC.** Auto-delete runs older than N days, configurable per
  project. Asset volume can grow fast (videos!).
- **Multi-project dashboard** with health metrics (pass rate over time,
  flaky test detector).
- **GitHub Action** wrapping the CLI uploader for one-line CI integration.
- **Trace viewer** — embed Playwright's official trace viewer (it's
  shipped as static HTML; we just need to serve it pointed at our
  storage).
- **Annotation drawing UI** in the viewer (currently the data model
  supports it; Claude/MCP can write annotations; the human-facing
  drawing UI is roadmap).

When the customer asks "what's next?" — surface the top 2-3 items from
this list with a quick sentence on each, and ask which to pick up.

## Picking up work after a session clear

1. Read this file end-to-end.
2. Check the **Build state** section above to find "In progress" and
   "Pending."
3. Run `git status` and `git log --oneline -20` to see what's been
   committed since this file was last updated.
4. If the customer's latest message names a specific feature, do that.
   Otherwise, ask: "I see X is in progress and Y/Z are pending — which
   should I pick up?"
5. After making meaningful progress, **update the Build state section**
   so the next session inherits accurate context.
