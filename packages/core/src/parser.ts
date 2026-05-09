import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  PlaywrightReport,
  PlaywrightReportSchema,
  PlaywrightSpec,
  PlaywrightSuite,
  PlaywrightTest,
  PlaywrightResult,
  PlaywrightAttachment,
} from './types.js';
import { resolveDataPath } from './storage.js';
import { computeSnapshotPath } from './snapshot_path.js';
import { AttachmentKind, RunStatus, SnapshotKind, TestStatus } from '@prisma/client';

export type ParsedSpec = {
  titlePath: string;
  title: string;
  file: string;
  line?: number;
  column?: number;
  projectName?: string;
  status: TestStatus;
  expectedStatus?: TestStatus;
  durationMs: number;
  results: ParsedResult[];
};

export type ParsedResult = {
  retry: number;
  status: TestStatus;
  durationMs: number;
  startedAt?: Date;
  workerIndex?: number;
  errorMessage?: string;
  errorStack?: string;
  errorSnippet?: string;
  stdout?: string;
  stderr?: string;
  attachments: ParsedAttachment[];
};

export type ParsedAttachment = {
  name: string;
  contentType?: string;
  storagePath: string; // relative to DATA_DIR
  sizeBytes?: number;
  kind: AttachmentKind;
  snapshotKind?: SnapshotKind;
  snapshotName?: string;
  /** Repo-relative on-disk path of the BASELINE this snapshot maps to.
   *  Computed at parse time from the project's snapshotPathTemplate +
   *  spec.file + projectName + run platform. Used by the approve handler
   *  as the canonical key when promoting actual → Baseline. */
  snapshotPath?: string;
  /** Base64-encoded payload from `testInfo.attach({body, contentType})`.
   *  Present only when the original attachment had `body` and no `path`
   *  in the JSON report — the persistence layer decodes this and writes
   *  the bytes to `storagePath`, since the bundle zip won't contain the
   *  file (Playwright inlined the bytes in JSON instead). */
  inlineBody?: string;
};

/** Project-level config that the parser needs to compute baseline paths. */
export type ProjectSnapshotConfig = {
  snapshotPathTemplate: string;
  testDir: string;
  /** Runner platform from the run upload — "linux" / "darwin" / "win32". */
  platform: string;
};

/**
 * Read & validate report.json from an extracted bundle directory.
 * `bundleRel` is the directory relative to DATA_DIR.
 */
export async function loadReport(bundleRel: string): Promise<PlaywrightReport> {
  const reportPath = resolveDataPath(bundleRel, 'report.json');
  const raw = await fs.readFile(reportPath, 'utf-8');
  return PlaywrightReportSchema.parse(JSON.parse(raw));
}

/**
 * Walk the suite tree and produce a flat list of specs with their results
 * + attachments resolved to storage paths under DATA_DIR.
 */
export function flattenSpecs(
  report: PlaywrightReport,
  bundleRel: string,
  projectConfig?: ProjectSnapshotConfig,
): ParsedSpec[] {
  const out: ParsedSpec[] = [];

  const walk = (suite: PlaywrightSuite, ancestors: string[]): void => {
    const titles = [...ancestors, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        out.push(specToParsed(suite, spec, test, titles, bundleRel, projectConfig));
      }
    }
    for (const child of suite.suites ?? []) walk(child, titles);
  };

  for (const top of report.suites ?? []) walk(top, []);
  return out;
}

function specToParsed(
  suite: PlaywrightSuite,
  spec: PlaywrightSpec,
  test: PlaywrightTest,
  ancestorTitles: string[],
  bundleRel: string,
  projectConfig: ProjectSnapshotConfig | undefined,
): ParsedSpec {
  const titlePath = [...ancestorTitles, spec.title].filter(Boolean).join(' > ');
  const results = (test.results ?? []).map((r) =>
    resultToParsed(r, bundleRel, {
      specFile: spec.file,
      projectName: test.projectName,
      projectConfig,
    }),
  );
  const finalResult = results[results.length - 1];
  const status = (test.status ?? finalResult?.status ?? 'skipped') as TestStatus;
  const durationMs = results.reduce((a, r) => a + r.durationMs, 0);
  return {
    titlePath,
    title: spec.title,
    file: spec.file,
    line: spec.line,
    column: spec.column,
    projectName: test.projectName,
    status,
    expectedStatus: test.expectedStatus,
    durationMs,
    results,
  };
}

type SnapshotResolveCtx = {
  specFile: string;
  projectName?: string;
  projectConfig?: ProjectSnapshotConfig;
};

function resultToParsed(
  r: PlaywrightResult,
  bundleRel: string,
  ctx: SnapshotResolveCtx,
): ParsedResult {
  const errors = r.errors ?? [];
  const firstError = errors[0];
  const stdout = joinStream(r.stdout);
  const stderr = joinStream(r.stderr);
  const attachments = r.attachments ?? [];
  return {
    retry: r.retry ?? 0,
    status: r.status,
    durationMs: r.duration ?? 0,
    startedAt: r.startTime ? new Date(r.startTime) : undefined,
    workerIndex: r.workerIndex,
    errorMessage: firstError?.message,
    errorStack: firstError?.stack,
    errorSnippet: firstError?.snippet,
    stdout,
    stderr,
    attachments: attachments
      .map((a) => attachmentToParsed(a, bundleRel, ctx))
      .filter((x): x is ParsedAttachment => x !== null),
  };
}

function joinStream(
  arr: Array<string | { text: string }> | undefined,
): string | undefined {
  if (!arr || !arr.length) return undefined;
  return arr.map((x) => (typeof x === 'string' ? x : x.text)).join('');
}

function attachmentToParsed(
  a: PlaywrightAttachment,
  bundleRel: string,
  ctx: SnapshotResolveCtx,
): ParsedAttachment | null {
  // Playwright's JSON reporter writes attachments with a `path` that may be:
  //   1. Already-relative to the report root (e.g. "data/abcdef.png"). HTML
  //      reporter writes these.
  //   2. Absolute filesystem paths from the test runner's CWD, like
  //      "/Users/runner/work/visualize/visualize/test-results/.../trace.zip".
  //      Default JSON reporter behaviour. The action zips test-results/
  //      into the bundle so these resolve once we strip the host prefix.
  // Anchor on a segment we know exists in the bundle ("test-results/" or
  // "data/"). For absolute paths with no anchor we drop the attachment
  // rather than write a CI runner host path into the DB and into auth-
  // gated URLs — that's an info leak with no upside, since the file
  // wouldn't resolve on disk anyway.
  let relPath: string | null = null;
  if (a.path) {
    relPath = normalizeAttachmentPath(a.path);
    if (relPath === null) return null;
  }

  const inlineBody = !relPath && a.body ? a.body : undefined;
  const inlineExt = inlineBody
    ? extensionFor(a.contentType, a.name)
    : undefined;
  const storagePath = relPath
    ? path.posix.join(bundleRel, relPath)
    : path.posix.join(
        bundleRel,
        'inline',
        `${cryptoSafe(a.name)}${inlineExt ?? '.bin'}`,
      );

  const kind = classifyKind(a);
  const { snapshotKind, snapshotName } = classifySnapshot(a);

  let snapshotPath: string | undefined;
  if (snapshotKind && snapshotName && ctx.projectConfig && ctx.projectName) {
    const computed = computeSnapshotPath({
      template: ctx.projectConfig.snapshotPathTemplate,
      testDir: ctx.projectConfig.testDir,
      specFile: ctx.specFile,
      projectName: ctx.projectName,
      platform: ctx.projectConfig.platform,
      arg: snapshotName,
    });
    if (computed) snapshotPath = computed;
  }

  return {
    name: a.name,
    contentType: a.contentType,
    storagePath,
    kind,
    snapshotKind,
    snapshotName,
    snapshotPath,
    inlineBody,
  };
}

/** Pick a sensible extension for a body-inlined attachment so the file
 *  served from /api/files/... gets the right MIME type. Prefer the
 *  attachment's existing extension (e.g. "race-tracker.png" → ".png");
 *  fall back to a contentType lookup; finally ".bin". */
function extensionFor(contentType: string | undefined, name: string): string {
  const fromName = /\.[a-z0-9]+$/i.exec(name);
  if (fromName) return fromName[0]!.toLowerCase();
  if (!contentType) return '.bin';
  const ct = contentType.split(';')[0]!.trim().toLowerCase();
  switch (ct) {
    case 'image/png': return '.png';
    case 'image/jpeg': return '.jpg';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/svg+xml': return '.svg';
    case 'video/webm': return '.webm';
    case 'video/mp4': return '.mp4';
    case 'application/json': return '.json';
    case 'application/zip': return '.zip';
    case 'text/plain': return '.txt';
    case 'text/html': return '.html';
    default: return '.bin';
  }
}

// Exported for unit tests. Returns null when the path looks absolute
// (Linux `/...`, Windows `C:\...` or `C:/...`, UNC `\\...`) and we can't
// anchor on a known bundle segment — storing the raw absolute path would
// leak host filesystem layout into URLs.
export function normalizeAttachmentPath(raw: string): string | null {
  const m = /\/(test-results|data)\/.+$/.exec(raw);
  if (m && m.index !== undefined) {
    return raw.slice(m.index + 1);
  }
  if (looksAbsolute(raw)) return null;
  return raw.replace(/^[\\/]+/, '');
}

function looksAbsolute(raw: string): boolean {
  return /^([A-Za-z]:[\\/]|[\\/])/.test(raw);
}

function classifyKind(a: PlaywrightAttachment): AttachmentKind {
  const ct = a.contentType ?? '';
  if (a.name === 'trace' || ct === 'application/zip') return AttachmentKind.trace;
  if (ct.startsWith('image/')) return AttachmentKind.screenshot;
  if (ct.startsWith('video/')) return AttachmentKind.video;
  if (ct.startsWith('text/')) return AttachmentKind.text;
  return AttachmentKind.other;
}

/**
 * Playwright's `toHaveScreenshot()` emits attachments named:
 *   "<name>-actual"  "<name>-expected"  "<name>-diff"          (drift)
 *   "<name>-actual.png"                                         (missing baseline)
 * The trailing extension only appears when the baseline doesn't exist yet
 * (Playwright's "writing actual" path). Tolerate both so the approve UI
 * renders for first-time snapshots too.
 */
export function classifySnapshot(
  a: Pick<PlaywrightAttachment, 'name'>,
): { snapshotKind?: SnapshotKind; snapshotName?: string } {
  const m = /^(.*)-(actual|expected|diff)(?:\.[a-z0-9]+)?$/i.exec(a.name);
  if (!m) return {};
  return {
    snapshotKind: m[2] as SnapshotKind,
    snapshotName: m[1],
  };
}

function cryptoSafe(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, '_').slice(0, 80);
}

// --- Run-level rollup -------------------------------------------------------

export type RunRollup = {
  status: RunStatus;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  flakyTests: number;
  skippedTests: number;
  durationMs: number;
};

export function rollupRun(specs: ParsedSpec[]): RunRollup {
  let passed = 0;
  let failed = 0;
  let flaky = 0;
  let skipped = 0;
  let duration = 0;
  for (const s of specs) {
    duration += s.durationMs;
    switch (s.status) {
      case 'passed':
      case 'expected':
        passed++;
        break;
      case 'failed':
      case 'timedOut':
      case 'unexpected':
      case 'interrupted':
        failed++;
        break;
      case 'flaky':
        flaky++;
        break;
      case 'skipped':
        skipped++;
        break;
    }
  }
  let status: RunStatus = 'passed';
  if (failed > 0) status = 'failed';
  else if (flaky > 0) status = 'flaky';
  return {
    status,
    totalTests: specs.length,
    passedTests: passed,
    failedTests: failed,
    flakyTests: flaky,
    skippedTests: skipped,
    durationMs: duration,
  };
}
