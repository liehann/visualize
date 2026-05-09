import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { resolveDataPath } from '@visualize/core/storage';
import { computeDiffMetric } from '@visualize/core/diff_metrics';
import { attachmentSrc } from '@/lib/attachment-url';
import type { TestStatus } from '@prisma/client';

const FAILED_STATUSES = new Set<TestStatus>([
  'failed',
  'unexpected',
  'timedOut',
  'interrupted',
]);

const PASSED_STATUSES = new Set<TestStatus>(['passed', 'expected']);

export type RunSummary = {
  id: string;
  branch: string | null;
  prNumber: number | null;
  commitSha: string | null;
  ciRunUrl: string | null;
  createdAt: Date;
  status: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
};

export type StatusChangeKind = 'regressed' | 'fixed' | 'added' | 'removed';

export type StatusChange = {
  kind: StatusChangeKind;
  testKey: string;
  testTitle: string;
  testFile: string;
  fromStatus: TestStatus | null;
  toStatus: TestStatus | null;
  testIdA: string | null;
  testIdB: string | null;
};

export type VisualChangeKind = 'changed' | 'added' | 'removed';

export type VisualChange = {
  kind: VisualChangeKind;
  testKey: string;
  testTitle: string;
  testFile: string;
  testIdA: string | null;
  testIdB: string | null;
  snapshotName: string;
  actualASrc: string | null;
  actualBSrc: string | null;
  diffPercent: number | null;
  diffPixels: number | null;
};

export type RunComparison = {
  runA: RunSummary;
  runB: RunSummary;
  project: { id: string; slug: string; name: string };
  statusChanges: StatusChange[];
  visualChanges: VisualChange[];
  matchedTestCount: number;
  comparedSnapshotCount: number;
};

export type TestRow = {
  id: string;
  titlePath: string;
  title: string;
  file: string;
  projectName: string | null;
  status: TestStatus;
  results: Array<{
    id: string;
    retry: number;
    attachments: Array<{
      id: string;
      snapshotKind: 'actual' | 'expected' | 'diff' | null;
      snapshotName: string | null;
      storagePath: string;
    }>;
  }>;
};

export type VisualCandidate = {
  key: string;
  testTitle: string;
  testFile: string;
  testIdA: string | null;
  testIdB: string | null;
  snapshotName: string;
  aEntry: ActualEntry | null;
  bEntry: ActualEntry | null;
};

export type CategorizedTests = {
  statusChanges: StatusChange[];
  visualCandidates: VisualCandidate[];
  matchedTestCount: number;
};

export function categorizeTests(
  testsA: TestRow[],
  testsB: TestRow[],
): CategorizedTests {
  const aMap = new Map<string, TestRow>();
  for (const t of testsA) aMap.set(testKey(t), t);
  const bMap = new Map<string, TestRow>();
  for (const t of testsB) bMap.set(testKey(t), t);

  const statusChanges: StatusChange[] = [];
  const visualCandidates: VisualCandidate[] = [];
  let matchedTestCount = 0;
  const allKeys = new Set([...aMap.keys(), ...bMap.keys()]);

  for (const key of allKeys) {
    const a = aMap.get(key);
    const b = bMap.get(key);
    const aStatus = a?.status ?? null;
    const bStatus = b?.status ?? null;
    const change = diffStatus(aStatus, bStatus);
    if (change) {
      const display = b ?? a!;
      statusChanges.push({
        kind: change,
        testKey: key,
        testTitle: display.titlePath,
        testFile: display.file,
        fromStatus: aStatus,
        toStatus: bStatus,
        testIdA: a?.id ?? null,
        testIdB: b?.id ?? null,
      });
    }

    if (a && b) {
      matchedTestCount += 1;
      const aActuals = collectActuals(a);
      const bActuals = collectActuals(b);
      const allSnapNames = new Set([...aActuals.keys(), ...bActuals.keys()]);
      for (const name of allSnapNames) {
        visualCandidates.push({
          key,
          testTitle: b.titlePath,
          testFile: b.file,
          testIdA: a.id,
          testIdB: b.id,
          snapshotName: name,
          aEntry: aActuals.get(name) ?? null,
          bEntry: bActuals.get(name) ?? null,
        });
      }
    } else if (a) {
      const aActuals = collectActuals(a);
      for (const [name, entry] of aActuals) {
        visualCandidates.push({
          key,
          testTitle: a.titlePath,
          testFile: a.file,
          testIdA: a.id,
          testIdB: null,
          snapshotName: name,
          aEntry: entry,
          bEntry: null,
        });
      }
    } else if (b) {
      const bActuals = collectActuals(b);
      for (const [name, entry] of bActuals) {
        visualCandidates.push({
          key,
          testTitle: b.titlePath,
          testFile: b.file,
          testIdA: null,
          testIdB: b.id,
          snapshotName: name,
          aEntry: null,
          bEntry: entry,
        });
      }
    }
  }

  statusChanges.sort((x, y) => {
    const order = (k: StatusChangeKind) =>
      k === 'regressed' ? 0 : k === 'fixed' ? 1 : k === 'added' ? 2 : 3;
    return order(x.kind) - order(y.kind) || x.testTitle.localeCompare(y.testTitle);
  });

  return { statusChanges, visualCandidates, matchedTestCount };
}

export function sortVisualChanges(changes: VisualChange[]): VisualChange[] {
  return [...changes].sort((x, y) => {
    const order = (k: VisualChangeKind) =>
      k === 'changed' ? 0 : k === 'added' ? 1 : 2;
    const o = order(x.kind) - order(y.kind);
    if (o !== 0) return o;
    return (y.diffPercent ?? -1) - (x.diffPercent ?? -1);
  });
}

function testKey(t: { file: string; titlePath: string; projectName: string | null }): string {
  return `${t.projectName ?? ''}::${t.file}::${t.titlePath}`;
}

function classifyStatus(s: TestStatus): 'passed' | 'failed' | 'flaky' | 'skipped' | 'other' {
  if (PASSED_STATUSES.has(s)) return 'passed';
  if (FAILED_STATUSES.has(s)) return 'failed';
  if (s === 'flaky') return 'flaky';
  if (s === 'skipped') return 'skipped';
  return 'other';
}

export function diffStatus(
  a: TestStatus | null,
  b: TestStatus | null,
): StatusChangeKind | null {
  if (a === null && b === null) return null;
  if (a === null) return 'added';
  if (b === null) return 'removed';
  const ca = classifyStatus(a);
  const cb = classifyStatus(b);
  if (ca === cb) return null;
  if (ca === 'passed' && cb === 'failed') return 'regressed';
  if (ca === 'failed' && cb === 'passed') return 'fixed';
  if (cb === 'failed' && ca !== 'failed') return 'regressed';
  if (ca === 'failed' && cb !== 'failed') return 'fixed';
  return null;
}

type ActualEntry = {
  attachmentId: string;
  storagePath: string;
};

function collectActuals(test: TestRow): Map<string, ActualEntry> {
  const out = new Map<string, ActualEntry>();
  // Pick the highest-retry result so the screenshots reflect the final
  // attempt — matches how the run-detail page treats result history.
  const final = [...test.results].sort((a, b) => b.retry - a.retry)[0];
  if (!final) return out;
  for (const att of final.attachments) {
    if (att.snapshotKind !== 'actual' || !att.snapshotName) continue;
    if (!out.has(att.snapshotName)) {
      out.set(att.snapshotName, {
        attachmentId: att.id,
        storagePath: att.storagePath,
      });
    }
  }
  return out;
}

async function sha256(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

export async function compareRuns(
  runIdA: string,
  runIdB: string,
  opts: { maxVisualDiffs?: number } = {},
): Promise<RunComparison | null> {
  const maxVisualDiffs = opts.maxVisualDiffs ?? 200;

  const [runA, runB] = await Promise.all([
    loadRun(runIdA),
    loadRun(runIdB),
  ]);
  if (!runA || !runB) return null;
  if (runA.run.projectId !== runB.run.projectId) return null;

  const project = await prisma.project.findUnique({
    where: { id: runA.run.projectId },
    select: { id: true, slug: true, name: true },
  });
  if (!project) return null;

  const { statusChanges, visualCandidates, matchedTestCount } = categorizeTests(
    runA.tests,
    runB.tests,
  );

  const visualChanges: VisualChange[] = [];
  let comparedSnapshotCount = 0;
  for (const c of visualCandidates) {
    if (visualChanges.length >= maxVisualDiffs) break;
    if (c.aEntry && c.bEntry) {
      // Hash-gate: identical bytes are by far the common case in stable
      // suites, so skip the (much slower) pixelmatch decode for them.
      let aHash: string;
      let bHash: string;
      try {
        [aHash, bHash] = await Promise.all([
          sha256(resolveDataPath(c.aEntry.storagePath)),
          sha256(resolveDataPath(c.bEntry.storagePath)),
        ]);
      } catch {
        continue;
      }
      if (aHash === bHash) continue;
      comparedSnapshotCount += 1;
      let metric: { diffPixels: number; diffPercent: number } | null = null;
      try {
        const [aBytes, bBytes] = await Promise.all([
          fs.readFile(resolveDataPath(c.aEntry.storagePath)),
          fs.readFile(resolveDataPath(c.bEntry.storagePath)),
        ]);
        metric = await computeDiffMetric(aBytes, bBytes);
      } catch {
        metric = null;
      }
      visualChanges.push({
        kind: 'changed',
        testKey: c.key,
        testTitle: c.testTitle,
        testFile: c.testFile,
        testIdA: c.testIdA,
        testIdB: c.testIdB,
        snapshotName: c.snapshotName,
        actualASrc: attachmentSrc(c.aEntry.storagePath),
        actualBSrc: attachmentSrc(c.bEntry.storagePath),
        diffPercent: metric?.diffPercent ?? null,
        diffPixels: metric?.diffPixels ?? null,
      });
    } else if (c.bEntry) {
      visualChanges.push({
        kind: 'added',
        testKey: c.key,
        testTitle: c.testTitle,
        testFile: c.testFile,
        testIdA: c.testIdA,
        testIdB: c.testIdB,
        snapshotName: c.snapshotName,
        actualASrc: null,
        actualBSrc: attachmentSrc(c.bEntry.storagePath),
        diffPercent: null,
        diffPixels: null,
      });
    } else if (c.aEntry) {
      visualChanges.push({
        kind: 'removed',
        testKey: c.key,
        testTitle: c.testTitle,
        testFile: c.testFile,
        testIdA: c.testIdA,
        testIdB: c.testIdB,
        snapshotName: c.snapshotName,
        actualASrc: attachmentSrc(c.aEntry.storagePath),
        actualBSrc: null,
        diffPercent: null,
        diffPixels: null,
      });
    }
  }

  return {
    runA: toSummary(runA.run),
    runB: toSummary(runB.run),
    project,
    statusChanges,
    visualChanges: sortVisualChanges(visualChanges),
    matchedTestCount,
    comparedSnapshotCount,
  };
}

async function loadRun(id: string): Promise<{
  run: {
    id: string;
    projectId: string;
    branch: string | null;
    prNumber: number | null;
    commitSha: string | null;
    ciRunUrl: string | null;
    createdAt: Date;
    status: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
  };
  tests: TestRow[];
} | null> {
  const run = await prisma.run.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      branch: true,
      prNumber: true,
      commitSha: true,
      ciRunUrl: true,
      createdAt: true,
      status: true,
      totalTests: true,
      passedTests: true,
      failedTests: true,
    },
  });
  if (!run) return null;
  const tests = (await prisma.testCase.findMany({
    where: { runId: id },
    select: {
      id: true,
      titlePath: true,
      title: true,
      file: true,
      projectName: true,
      status: true,
      results: {
        select: {
          id: true,
          retry: true,
          attachments: {
            select: {
              id: true,
              snapshotKind: true,
              snapshotName: true,
              storagePath: true,
            },
          },
        },
      },
    },
  })) as TestRow[];
  return { run, tests };
}

function toSummary(r: {
  id: string;
  branch: string | null;
  prNumber: number | null;
  commitSha: string | null;
  ciRunUrl: string | null;
  createdAt: Date;
  status: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
}): RunSummary {
  return {
    id: r.id,
    branch: r.branch,
    prNumber: r.prNumber,
    commitSha: r.commitSha,
    ciRunUrl: r.ciRunUrl,
    createdAt: r.createdAt,
    status: r.status,
    totalTests: r.totalTests,
    passedTests: r.passedTests,
    failedTests: r.failedTests,
  };
}
