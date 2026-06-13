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

   **Hard rule:** every parser change must be accompanied by a test
   against a real Playwright report fixture committed in the repo at
   `packages/core/__fixtures__/`. Synthetic data isn't enough — Playwright
   has versioned its JSON reporter shape and switched between absolute
   and relative attachment paths; the only way to catch those drifts is
   to parse a real report. If you're tempted to ship a parser change
   without exercising a fixture, stop and add the fixture first.
   Capture new fixtures by running `apps/viewer/tests/` locally with
   `DEV_AUTH_BYPASS=true`, copying the resulting `playwright-report/`
   and `test-results/` into a new fixture directory, then anonymizing
   any host paths.

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

Each row is a separate CI job; together they fence off the bug classes
we've actually been bitten by.

| Job | Catches |
| --- | --- |
| **typecheck + build** (`pnpm -r typecheck` + `pnpm -r test`) | Logic regressions, type drift, broken imports. 88 vitest unit tests across all four packages — parser, snapshot path, tokens, diff metrics, data-dir check, route + component tests, MCP json-schema converter, ingest auth hook. |
| **actionlint (workflows)** | `${{ … }}` expression typos, missing required keys, shell-script issues in `.github/workflows/*.yml`. Doesn't validate composite-action manifests (`action.yml`) — see below. |
| **e2e + visual upload** | Dogfood: viewer Playwright suite + visual regression. Also acts as the canary for `action.yml` manifest regressions, because the dogfood workflow uses `uses: ./` so any `action.yml` parse error fails on the contributing PR before `@main` can poison downstream consumers. |
| **prod compose stack boots cleanly** | Deploy-config bugs the dev pipeline can't see: invalid mount syntax, mode drift (the `:ro` regression that took prod's approve flow down), broken Dockerfiles, missing env-var interpolation, non-healthy services. Combined with the boot-time `DATA_DIR` write check, a misconfigured volume fails this job at PR time. |
| **Visual regression** | The whole product's reason to exist — covered by the per-screenshot approve flow, not by automation. New diffs need a human eye through the viewer. |

Other invariants that are not jobs but are still load-bearing:

- **No silent data migrations.** Every Prisma migration is reviewed;
  destructive migrations require a backup script in the same PR.
- **`uses: ./` in the dogfood workflow.** Any change to `action.yml`
  is parsed by the contributing PR's CI. Don't switch back to
  `@main` — that's how PR #28's broken manifest reached every consumer
  before our own pipeline noticed.
- **Boot-time `DATA_DIR` write check.** The viewer
  (`apps/viewer/instrumentation.ts`) and ingest (`apps/ingest/src/server.ts`)
  call `assertDataDirWritable()` from `@visualize/core/data_dir_check`
  before serving traffic. Misconfigured volume = service refuses to
  start with a clear message, instead of an opaque ENOENT on the first
  user click.

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

> **Gotcha — `DATA_DIR` must be one shared absolute path in local dev.**
> `.env.example` ships `DATA_DIR=./data` (relative). That's fine in prod
> (the compose mounts an absolute volume) but in local dev it resolves
> against each process's **cwd**, and `pnpm --filter` runs each service
> from its own package dir — so `dev:ingest` writes `apps/ingest/data`,
> `dev:viewer` reads `apps/viewer/data`, and `scripts/seed.ts` (run from
> the repo root) writes `./data`. Three different folders → the viewer
> serves **zero images** even though the upload "succeeded". When you need
> ingest + viewer + seed to share files locally, export one absolute path
> for all of them before launching, e.g.:
>
> ```bash
> export DATA_DIR="$PWD/data"   # from the repo root, in each terminal
> # also point DATABASE_URL at the dev Postgres host:port you actually use
> ```
>
> A real fix would be to resolve `DATA_DIR` against the repo root inside
> `data_dir_check`/`storage`, but the absolute-path export keeps dev simple
> without changing prod behavior.

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

### Done (session 2, 2026-05-07)

- **Booted the stack end-to-end.** Postgres → migrations → ingest →
  viewer all running. Typecheck clean across all 4 packages.
- **Round-trip verified.** Built a sample Playwright report bundle,
  uploaded via `scripts/upload-report.ts` → CLI bundles + posts to
  ingest → ingest extracts + parses + persists → viewer renders the
  new project + run + tests with all the diff/video/error context.
- **Home page redesigned** as project-grouped cards (per stakeholder
  direction): pass-rate (color-coded), 30-run sparkline, latest-run
  detail with PR/branch/commit/CI badges + per-status counts, plus a
  mini-list of the next 5 runs.
- **Dev auth bypass** via `DEV_AUTH_BYPASS=true` env so future sessions
  can iterate the UI without standing up Authentik. Production unchanged.
- **GitHub Action** at `action.yml` (composite). One YAML block in a
  downstream repo's workflow uploads the Playwright report. Auto-detects
  branch / PR / commit / CI run URL from the GitHub context. Optional
  `baseline-path` input to also push goldens. Defaults to `fail-on-error:
  false` so a flaky Visualize never breaks downstream CI.
- **Healthchecks**: viewer `/api/health` (pings DB), ingest+mcp
  `/healthz`. Wired into docker-compose so Coolify probes them.
- **README expanded** with a concrete Coolify + Authentik walkthrough:
  the SQL to provision the DB, the OIDC redirect URI, the env vars to
  set, the hostname mappings, the migration step, and a smoke-test
  curl block.
- `scripts/seed.ts` for realistic dev data (2 projects, 32 runs, real
  PNG snapshot triplet, real video file, real trace zip).
- `scripts/screenshot.ts` drives Playwright against the running viewer
  and commits screenshots under `screenshots/` as artifacts visible on
  GitHub.

### Done (session 3, 2026-05-08) — the PR loop

The theme of this session: tighten the **PR feedback loop** so daily devs
on kuruvu_track / tizipop / dinners get pulled into Visualize instead of
having to remember it exists.

- **Lightbox** (`apps/viewer/src/components/diff-lightbox.tsx`,
  `diff-gallery.tsx`). Click any expected/actual/diff image → full-screen
  view with four modes: side, **drag-to-compare slider**, mix-blend onion
  overlay, dedicated diff. Wheel-to-zoom, drag-to-pan, double-click to
  reset, keyboard shortcuts (← → A 1 2 3 4 Esc) for zero-mouse triage.
- **Bulk approve in run** (`apps/viewer/src/components/bulk-approve.tsx`,
  `apps/viewer/src/app/api/approve/run/[runId]/route.ts`). Run page
  shows a "N visual changes pending" banner; clicking opens a sheet
  listing every pending diff with thumbnails and approves them all in
  one POST. Per-attachment approve logic factored to `lib/approve.ts`
  so the single + bulk paths share a single source of truth. List is
  sorted by impact (heaviest diffs first).
- **PR comment via the GitHub Action** (`action.yml`). When `viewer-url`
  is set and the workflow runs on a PR, the action upserts a sticky
  comment with the run's pass/fail/flaky/skipped counts, a deep-link to
  the viewer, and a callout when there are unreviewed visual diffs.
  Marker-based upsert keeps a single comment per project so the PR
  doesn't get spammed across re-runs.
- **GitHub commit status** (`action.yml`). Same step suite posts a
  `visualize/visual-diffs` status: `pending` (with target_url to the
  viewer) when diffs need review — branch protection then blocks merge
  — and `success` when there were no visual changes. Fail-soft on
  `statuses: write` denial (e.g. fork PRs with default token).
- **Smart diff metrics.** Ingest now runs `pixelmatch` on every
  expected/actual pair (`apps/ingest/src/diff_metrics.ts`) and stamps
  `diffPixels` + `diffPercent` on the diff Attachment. Schema migration
  `20260508140000_attachment_diff_metrics` is additive (nullable). The
  viewer renders a **color-coded `12.4%` badge** in the gallery, the
  lightbox header, and the bulk-approve sheet — red ≥10%, amber ≥1%,
  subtle <1% (so reviewers can ignore antialiasing-grade noise at a
  glance). Mismatched dimensions get a 100% badge so they're not
  silently skipped.
- **Auto-flip GitHub status on approve** (`apps/viewer/src/lib/diff-status.ts`).
  When `VIEWER_GITHUB_TOKEN` is set and a project has `githubRepo`, the
  approve API (single + bulk) re-evaluates remaining unapproved diffs
  in the run after each approval and posts a fresh
  `visualize/visual-diffs` commit status. Closes the merge gate
  immediately on full approval — no need to push or re-run CI just to
  flip the check. Best-effort: silent no-op without the token, logs
  but doesn't fail on non-2xx (the approval itself has already
  succeeded). Adds `VIEWER_GITHUB_TOKEN` and `VIEWER_URL` to viewer env.
- **Design lab.** Two demo pages (`/demo/lightbox`, `/demo/bulk-approve`)
  render fixture data with no DB, so future Claude sessions can iterate
  on UI components without booting Postgres. Verifier scripts at
  `scripts/verify-lightbox.ts` and `scripts/verify-bulk-approve.ts`
  drive Playwright through every interaction state and dump screenshots
  to `screenshots/` for review.

### Done (session 4, 2026-05-15) — make the viewer real on real data

Customer report: the polished demo (keyboard step-through + bulk
approve) didn't seem to exist in the app. Root cause: the components
*were* wired in, but the viewer only ever rendered snapshot imagery
that Playwright embeds in the report — and Playwright embeds it only on
visual **failure**. The uploaded golden `Baseline` (req #8) was stored
but never used for display. Four fixes, all stemming from that root:

- **`expected` now sourced from the `Baseline`**
  (`apps/viewer/src/lib/triplet-baseline.ts`). On the test page and the
  run-wide diff loader, any triplet missing a report-embedded `expected`
  is backfilled from the golden (match on `projectId` + `name`). A
  report-embedded expected still wins. Killed the "only new + diff, no
  before" gap. Labelled `current baseline` in the side view + lightbox
  so reviewers know the provenance. Unit-tested
  (`triplet-baseline.test.ts`). No parser change — the expected file
  genuinely isn't in the bundle; the Baseline is the correct source.
- **Run-wide keyboard step-through review**
  (`apps/viewer/src/components/bulk-approve.tsx`). The run page already
  gathered every pending diff across every test; that whole list now
  feeds the existing `DiffLightbox`. Banner offers **review N**
  (steps across *tests* with `← →`, `A` approves + auto-advances,
  end-of-list closes + refreshes) alongside **approve all**. This is
  the demo loop, on real run data. `loadPendingDiffs` now also attaches
  the baseline `expectedSrc` so the step-through shows before/after.
- **Unified + explained the diff modes.** Inline `SnapshotDiff` lost
  its confusing tab switcher — it's now a static expected|actual|diff
  strip + a **compare** button into the lightbox where all interactive
  modes live (one vocabulary). Lightbox `onion` → **difference** with a
  one-line legend ("identical pixels turn black; anything that glows
  changed"); per-mode tooltips; footer names each mode. `run-vs-run`'s
  `overlay` tab renamed to `difference` + same legend for consistency.
- **Per-project Baselines gallery**
  (`apps/viewer/src/components/baseline-gallery.tsx`). The golden *is*
  the current passing screenshot; the project page now shows a
  browsable grid of every current baseline with a keyboard-steppable
  full-screen viewer. Passing test pages (which have zero attachments)
  now explain that and link to the gallery. Honest limitation:
  Playwright emits no snapshot names on pass, so we can't map an
  individual passing test → its exact goldens; the gallery is
  per-project.

- **Attachments section made usable.** The "confusing stuff" the
  customer meant was actually `error-context` + `trace` (trace turned
  out to be loved once seen). `error-context` rendered as an empty box
  with only a "view raw" link; now `AttachmentViewer` is an async
  server component that reads text/`error-context` content inline and
  explains what error-context is (Playwright's page/ARIA snapshot at
  failure). Attachment **screenshots** were tiny with no way to enlarge
  — new `ExpandableImage` gives every one a full-screen zoom viewer
  (Esc to close, click to toggle actual-size).

Repo-wide typecheck clean, 54 viewer tests (+ core/ingest/mcp) green,
viewer prod build green.

### Done (session 5, 2026-06-11) — review ergonomics + local pre-approval

Three stakeholder asks: default the diff viewer to split, navigate diffs
across the whole run, and approve goldens **before** CI runs.

- **Remembered view + split default** (`diff-lightbox.tsx`). The lightbox
  now opens in **split (side)** view by default and remembers the
  last-picked mode in `localStorage` (`visualize:lightbox-view`) across
  diffs and sessions. A remembered mode the current triplet can't show
  (e.g. slider with no `expected`) falls back gracefully **without
  forgetting** the preference. Keyboard `1-4` are guarded to available
  modes. New unit tests cover default + persistence + fallback.
- **Cross-test diff navigation** (`lib/run-diffs.ts`,
  `diff-gallery.tsx`, `diff-lightbox.tsx`). New `loadRunDiffs()` gathers
  every changed snapshot across a run (failed-first order, golden
  backfilled as `expected`, `approved` flag from the Baseline table) —
  one ordered list shared by the run page and each test page. Opening a
  diff from a test now steps `← →` across **every failed test in the
  run**, not just that test's snapshots. The lightbox header names the
  originating test and deep-links to it (`SnapshotTriplet` gained
  `testId`/`testTitle`/`testHref`).
- **Always-available run review + remembered approvals**
  (`bulk-approve.tsx`). `BulkApprove` now takes the full run-wide
  triplet list. When changes are pending it shows the warn banner with
  **review N** / **approve all**; when everything's approved it shows a
  muted **review N** bar so you can re-step the run any time. Approvals
  persist (Baseline rows) and render as `approved` on reload. The old
  page-local `loadPendingDiffs` was deleted in favor of the shared lib;
  the demo page + tests were migrated to the triplet API.
- **Local pre-approval: `pnpm push:local`**
  (`scripts/visualize-push-local.mjs`). Portable, zero-dependency
  (Node 20 built-ins + `git`/`zip`; bundling inlined — no bash). Bundles
  the local `playwright-report/` + `test-results/`, auto-detects
  branch/commit from git, and uploads as a **branch run**
  (`ciProvider: local`) to the hosted ingest. Prints a deep-link to
  review + approve in the real viewer. Config from flags or env
  (`VISUALIZE_INGEST_URL`/`INGEST_PUBLIC_URL`, `VISUALIZE_TOKEN`/
  `API_SECRET`, `VISUALIZE_PROJECT`, `VIEWER_URL`). Approving there
  writes the **hosted baseline**; the next CI run's `fetch-baselines`
  pulls it so CI passes first try — no waiting for CI to fail, no
  full rerun. (Per stakeholder pick: push-to-hosted + hosted-baseline,
  not on-disk goldens.)
- **Consumer recipe shipped to the `phloots-visualize` skill** (§8). The
  same `.mjs` is vendored into consumer repos (`curl` one-liner) +
  `pnpm push:local`. Critical caveat documented: Playwright keys goldens
  by `{platform}`, so devs must generate the local run **in the
  CI-matching Linux container** (`mcr.microsoft.com/playwright`) or the
  approved `-darwin` golden won't match CI's `-linux`. Fixed a stale
  troubleshooting bullet there that still told devs to
  `--update-snapshots`.

### Done (session 6, 2026-06-13) — review-flow UX + local-goldens distribution

- **Step-through review is now the primary, obvious path.** Run-page
  banner reads "N goldens need review" with a prominent "Review N
  goldens" button (+ keyboard hint); the lightbox is a real **queue** —
  `A` approves and auto-advances to the next *unapproved* golden,
  skipping done ones, and closes when none remain. Header shows
  `X of N · M approved`.
- **"N goldens need review" shows for any pending golden, incl. a single
  one and first-time writes.** `loadRunDiffs` no longer filters to
  actuals-with-a-diff; it returns every non-approved `actual` (changed
  diff *or* first-time write), so the banner is consistent across runs
  (a run of only first-time goldens — e.g. a `push:local` dogfood run —
  now surfaces the review UI instead of nothing).
- **Navigation ergonomics.** "back to run" / "all runs" are bordered
  button targets, not tiny text. The "Review N goldens" launcher now also
  renders on **every test page** (test page loads the run-wide list
  unconditionally), so re-approving never requires bouncing back to the
  run.
- **Dev `DATA_DIR` gotcha documented** (relative `./data` resolves per
  cwd → invisible images). See the Local dev callout above.

Repo-wide typecheck clean, 56 viewer tests (+ core/ingest/mcp) green,
viewer prod build green.

### What still wants doing (Claude prioritizes; stakeholder may redirect)

1. **Embedded Playwright trace viewer.** Playwright ships `show-trace`
   as static HTML that can be served against our storage. Today the
   viewer just offers Download.
2. **Annotation drawing UI.** Data model and MCP write path both work;
   the human-facing draw-on-screenshot UI is roadmap.
3. **Run-vs-run comparison.** Pick two runs (e.g. main vs PR), show
   only changed tests with the diffs side by side.
4. **Retention / GC.** Videos eat disk fast — auto-delete runs older
   than N days per project.
5. **Slack/webhook notifications** on failure or approval.
6. **Smoke / round-trip test in CI** — the verification I just did
   manually should be a job that boots the stack with docker-compose
   and asserts the upload pipeline still works on every PR.

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
