#!/usr/bin/env node
/**
 * visualize-push-local — push a *local* Playwright run to a Visualize
 * instance so you can review + approve visual goldens before CI runs.
 *
 * Portable + zero-dependency (Node 20+ built-ins only). This is the file the
 * `phloots-visualize` skill vendors into consumer repos, and it's what
 * `pnpm push:local` runs here. Requires only `git` and `zip` on PATH.
 *
 *   node scripts/visualize-push-local.mjs            # uses flags / env / .env
 *
 * Workflow:
 *   1. Run Playwright locally — ideally in the same Linux container CI uses
 *      (e.g. mcr.microsoft.com/playwright:vX) so goldens are keyed to the
 *      same {platform} CI expects. It writes playwright-report/ + test-results/.
 *   2. `node scripts/visualize-push-local.mjs` bundles + uploads them.
 *   3. Open the printed link → "Review N goldens" → approve the intended ones.
 *   4. On the next CI run, the GitHub Action's `fetch-baselines` mode pulls the
 *      approved goldens into the tree before `playwright test`, so it passes.
 *
 * Config (flag → env fallback):
 *   --url          VISUALIZE_INGEST_URL | INGEST_PUBLIC_URL   ingest base URL
 *   --secret       VISUALIZE_TOKEN | API_SECRET               Bearer token
 *   --project      VISUALIZE_PROJECT                          project slug
 *   --viewer-url   VIEWER_URL                                 for the deep link
 *   --report       (default ./playwright-report)
 *   --test-results (default ./test-results)
 *   --project-name (default: slug)
 */
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

function flag(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Tiny .env loader: KEY=VALUE lines, strips quotes, never overrides real env. */
async function loadDotEnv() {
  try {
    const raw = await fs.readFile(path.resolve('.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    // no .env — rely on the real environment.
  }
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) return undefined;
  const out = (r.stdout ?? '').trim();
  return out.length > 0 ? out : undefined;
}

/** Bundle report + test-results into a zip the ingest accepts (no bash dep). */
async function bundle(reportDir, testResultsDir) {
  const staging = path.join(os.tmpdir(), `visualize-stage-${randomUUID()}`);
  const outZip = path.join(os.tmpdir(), `visualize-${randomUUID()}.zip`);

  // staging := a copy of the report dir (so report.json lands at its root).
  await fs.cp(reportDir, staging, { recursive: true });

  if (existsSync(testResultsDir)) {
    const absTestResults = path.resolve(testResultsDir);
    await fs.cp(absTestResults, path.join(staging, 'test-results'), {
      recursive: true,
    });
    // Rewrite Playwright's JSON reporter output: absolute attachment paths
    // under the original outputDir → bundle-relative `test-results/<rest>`.
    const reportJson = path.join(staging, 'report.json');
    if (existsSync(reportJson)) {
      const json = await fs.readFile(reportJson, 'utf8');
      const rewritten = json.split(`${absTestResults}/`).join('test-results/');
      if (rewritten !== json) await fs.writeFile(reportJson, rewritten);
    }
  }

  const r = spawnSync('zip', ['-rq', outZip, '.'], {
    cwd: staging,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await fs.rm(staging, { recursive: true, force: true });
  if (r.status !== 0) {
    console.error('Bundling failed (is `zip` installed?).');
    process.exit(1);
  }
  return outZip;
}

async function main() {
  await loadDotEnv();
  const argv = process.argv.slice(2);
  const env = process.env;

  const url = (
    flag(argv, 'url') ??
    env.VISUALIZE_INGEST_URL ??
    env.INGEST_PUBLIC_URL ??
    ''
  ).replace(/\/+$/, '');
  const secret = flag(argv, 'secret') ?? env.VISUALIZE_TOKEN ?? env.API_SECRET ?? '';
  const project = flag(argv, 'project') ?? env.VISUALIZE_PROJECT ?? '';
  const viewerUrl = (flag(argv, 'viewer-url') ?? env.VIEWER_URL ?? '').replace(/\/+$/, '');
  const projectName = flag(argv, 'project-name');
  const reportDir = path.resolve(flag(argv, 'report') ?? 'playwright-report');
  const testResultsDir = path.resolve(flag(argv, 'test-results') ?? 'test-results');

  const missing = [];
  if (!url) missing.push('--url (or VISUALIZE_INGEST_URL / INGEST_PUBLIC_URL)');
  if (!secret) missing.push('--secret (or VISUALIZE_TOKEN / API_SECRET)');
  if (!project) missing.push('--project (or VISUALIZE_PROJECT)');
  if (missing.length) {
    console.error('Missing required config:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
  if (!existsSync(reportDir)) {
    console.error(
      `No Playwright report at ${reportDir}.\n` +
        'Run your Playwright tests first, or pass --report <dir>.',
    );
    process.exit(1);
  }

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = git(['rev-parse', 'HEAD']);

  console.log(
    `Bundling ${reportDir}` + (existsSync(testResultsDir) ? ' + test-results' : ''),
  );
  const zipPath = await bundle(reportDir, testResultsDir);

  const meta = {
    projectSlug: project,
    projectName,
    branch,
    commitSha: commit,
    ciProvider: 'local',
  };
  const form = new FormData();
  form.append('meta', JSON.stringify(meta));
  const zipBytes = new Uint8Array(await fs.readFile(zipPath));
  form.append(
    'bundle',
    new Blob([zipBytes], { type: 'application/octet-stream' }),
    'playwright-report.zip',
  );

  console.log(`Uploading run to ${url}/runs  (branch: ${branch ?? '?'})`);
  const res = await fetch(`${url}/runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    body: form,
  });
  await fs.unlink(zipPath).catch(() => {});

  const text = await res.text();
  if (!res.ok) {
    console.error(`Upload failed (${res.status}):`, text);
    process.exit(1);
  }

  let runId;
  try {
    runId = JSON.parse(text).id;
  } catch {
    // non-JSON — fall through and echo it.
  }

  if (runId && viewerUrl) {
    console.log(`\n✓ Uploaded. Review + approve goldens here:\n  ${viewerUrl}/runs/${runId}\n`);
  } else if (runId) {
    console.log(
      `\n✓ Uploaded run ${runId}. Open it in your Visualize viewer to review` +
        ` (set VIEWER_URL / --viewer-url for a direct link).\n`,
    );
  } else {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
