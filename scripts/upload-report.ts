#!/usr/bin/env tsx
/**
 * Upload a Playwright report bundle (and/or golden screenshots) to a
 * running Visualize ingest service.
 *
 * Usage:
 *   tsx scripts/upload-report.ts --url https://ingest.example.com \
 *     --secret $API_SECRET \
 *     --project web \
 *     --branch $GITHUB_REF_NAME \
 *     --pr $GITHUB_PR_NUMBER \
 *     --commit $GITHUB_SHA \
 *     --report ./playwright-report
 *
 *   tsx scripts/upload-report.ts --url ... --secret ... --project web \
 *     --baseline-name homepage --baseline ./snapshots/homepage.png
 *
 * No external deps — uses Node 20+ built-ins (fetch, FormData, Blob).
 */
import { promises as fs, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

type Args = {
  url: string;
  secret: string;
  project: string;
  projectName?: string;
  branch?: string;
  pr?: number;
  commit?: string;
  ciProvider?: string;
  ciRunUrl?: string;
  report?: string;
  baseline?: string;
  baselineName?: string;
  browser?: string;
  platform?: string;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const need = (name: keyof Args): string => {
    const v = get(name);
    if (!v) {
      console.error(`Missing required flag: --${name}`);
      process.exit(1);
    }
    return v;
  };
  return {
    url: need('url').replace(/\/+$/, ''),
    secret: need('secret'),
    project: need('project'),
    projectName: get('project-name'),
    branch: get('branch'),
    pr: get('pr') ? Number(get('pr')) : undefined,
    commit: get('commit'),
    ciProvider: get('ci-provider'),
    ciRunUrl: get('ci-run-url'),
    report: get('report'),
    baseline: get('baseline'),
    baselineName: get('baseline-name'),
    browser: get('browser'),
    platform: get('platform'),
  };
}

async function uploadReport(args: Args, reportDir: string) {
  const zipPath = path.join(tmpdir(), `visualize-${randomUUID()}.zip`);
  // Use system `zip` (present on every CI runner) to avoid a dep.
  const r = spawnSync('zip', ['-rq', zipPath, '.'], { cwd: reportDir });
  if (r.status !== 0) {
    console.error('zip failed:', r.stderr.toString());
    process.exit(1);
  }
  const meta = {
    projectSlug: args.project,
    projectName: args.projectName,
    branch: args.branch,
    prNumber: args.pr,
    commitSha: args.commit,
    ciProvider: args.ciProvider,
    ciRunUrl: args.ciRunUrl,
  };
  const form = new FormData();
  form.append('meta', JSON.stringify(meta));
  const stat = statSync(zipPath);
  const blob = await blobFromStream(createReadStream(zipPath), stat.size);
  form.append('bundle', blob, 'playwright-report.zip');

  const res = await fetch(`${args.url}/runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.secret}` },
    body: form,
  });
  await fs.unlink(zipPath).catch(() => {});
  const text = await res.text();
  if (!res.ok) {
    console.error(`Upload failed (${res.status}):`, text);
    process.exit(1);
  }
  console.log(text);
}

async function uploadBaseline(args: Args) {
  if (!args.baseline || !args.baselineName) {
    console.error('--baseline and --baseline-name are required');
    process.exit(1);
  }
  const meta = {
    projectSlug: args.project,
    projectName: args.projectName,
    name: args.baselineName,
    browser: args.browser,
    platform: args.platform,
    branch: args.branch,
    commitSha: args.commit,
  };
  const form = new FormData();
  form.append('meta', JSON.stringify(meta));
  const stat = statSync(args.baseline);
  const blob = await blobFromStream(createReadStream(args.baseline), stat.size);
  form.append('image', blob, path.basename(args.baseline));

  const res = await fetch(`${args.url}/baselines`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.secret}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Upload failed (${res.status}):`, text);
    process.exit(1);
  }
  console.log(text);
}

async function blobFromStream(stream: NodeJS.ReadableStream, size: number): Promise<Blob> {
  const buffers: Buffer[] = [];
  for await (const chunk of stream) {
    buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Blob(buffers, { type: 'application/octet-stream' });
}

const args = parseArgs(process.argv.slice(2));
if (args.report) {
  await uploadReport(args, path.resolve(args.report));
} else if (args.baseline) {
  await uploadBaseline(args);
} else {
  console.error('Provide either --report <dir> or --baseline <png>');
  process.exit(1);
}
