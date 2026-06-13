import { prisma } from '@/lib/db';
import { attachmentSrc } from '@/lib/attachment-url';
import type { SnapshotTriplet } from '@/components/snapshot-diff';

export type RunDiff = {
  attachmentId: string; // the 'actual' attachment id — the approve target
  snapshotName: string;
  testId: string;
  testTitle: string;
  actualSrc: string;
  expectedSrc?: string;
  diffSrc?: string;
  diffPercent?: number;
  approved: boolean;
};

function statusRank(s: string): number {
  if (s === 'failed' || s === 'unexpected' || s === 'timedOut' || s === 'interrupted')
    return 0;
  if (s === 'flaky') return 1;
  if (s === 'skipped') return 3;
  return 2;
}

/**
 * Every golden across a run that may need review — each `actual` snapshot,
 * whether it's a changed diff (has a matching `diff` image) or a first-time
 * write (new golden, no diff yet) — in failed-first test order, with the
 * golden Baseline backfilled as `expected` and an `approved` flag from the
 * Baseline table.
 *
 * Powers both the run-wide review / bulk-approve banner and the cross-test
 * step-through opened from a single test's diff — one ordered list shared by
 * both so navigation is consistent, and so the "N goldens need review" UI
 * shows for any run with pending goldens, not only runs with diffs.
 */
export async function loadRunDiffs(
  runId: string,
  projectId: string,
): Promise<RunDiff[]> {
  const actuals = await prisma.attachment.findMany({
    where: { snapshotKind: 'actual', testResult: { testCase: { runId } } },
    include: { testResult: { include: { testCase: true } } },
  });

  const diffByKey = new Map<string, { src: string; percent?: number }>();
  const diffAttachments = await prisma.attachment.findMany({
    where: { snapshotKind: 'diff', testResult: { testCase: { runId } } },
    include: { testResult: true },
  });
  for (const d of diffAttachments) {
    if (!d.snapshotName) continue;
    diffByKey.set(`${d.testResult.testCaseId}::${d.snapshotName}`, {
      src: attachmentSrc(d.storagePath),
      percent: d.diffPercent ?? undefined,
    });
  }

  // The golden Baseline is the real "before" — Playwright's report rarely
  // carries a usable expected. Map snapshot name → baseline src.
  const snapshotNames = [
    ...new Set(actuals.map((a) => a.snapshotName).filter((n): n is string => !!n)),
  ];
  const baselineSrcByName = new Map<string, string>();
  if (snapshotNames.length > 0) {
    const bls = await prisma.baseline.findMany({
      where: { projectId, name: { in: snapshotNames } },
      select: { name: true, storagePath: true },
    });
    for (const b of bls) baselineSrcByName.set(b.name, attachmentSrc(b.storagePath));
  }

  const approvedFromIds = new Set(
    (
      await prisma.baseline.findMany({
        where: {
          projectId,
          approvedFromAttachmentId: { in: actuals.map((a) => a.id) },
        },
        select: { approvedFromAttachmentId: true },
      })
    )
      .map((b) => b.approvedFromAttachmentId)
      .filter((id): id is string => !!id),
  );

  const rows = actuals
    .filter((a) => !!a.snapshotName)
    .map((a) => {
      const tc = a.testResult.testCase;
      const d = diffByKey.get(`${a.testResult.testCaseId}::${a.snapshotName}`);
      return {
        attachmentId: a.id,
        snapshotName: a.snapshotName ?? '',
        testId: tc.id,
        testTitle: tc.titlePath,
        testStatus: tc.status,
        actualSrc: attachmentSrc(a.storagePath),
        expectedSrc: baselineSrcByName.get(a.snapshotName ?? ''),
        diffSrc: d?.src,
        diffPercent: d?.percent,
        approved: approvedFromIds.has(a.id),
      };
    });

  // Failed-first, then by test title, then heaviest diff first — matches the
  // run page's test ordering so stepping stays within a test before moving on.
  rows.sort(
    (a, b) =>
      statusRank(a.testStatus) - statusRank(b.testStatus) ||
      a.testTitle.localeCompare(b.testTitle) ||
      (b.diffPercent ?? 0) - (a.diffPercent ?? 0),
  );

  return rows.map(({ testStatus: _testStatus, ...d }) => d);
}

/** Convert run diffs to lightbox triplets, optionally deep-linking each to its test. */
export function runDiffsToTriplets(
  diffs: RunDiff[],
  hrefFor?: (d: RunDiff) => string,
): SnapshotTriplet[] {
  return diffs.map((d) => ({
    snapshotName: d.snapshotName,
    testId: d.testId,
    testTitle: d.testTitle,
    testHref: hrefFor?.(d),
    actual: { id: d.attachmentId, src: d.actualSrc },
    expected: d.expectedSrc ? { src: d.expectedSrc, fromBaseline: true } : undefined,
    diff: d.diffSrc ? { id: `${d.attachmentId}-diff`, src: d.diffSrc } : undefined,
    diffPercent: d.diffPercent,
    approved: d.approved,
  }));
}
