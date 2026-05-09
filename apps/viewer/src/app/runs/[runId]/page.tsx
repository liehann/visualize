import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { RunStatusBadge, TestStatusBadge } from '@/components/status-badge';
import { BranchPr } from '@/components/branch-pr';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import { ChevronRight } from 'lucide-react';
import { AutoRefresh } from '@/components/auto-refresh';
import { BulkApprove, type PendingDiff } from '@/components/bulk-approve';
import { attachmentSrc } from '@/lib/attachment-url';

export const dynamic = 'force-dynamic';

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      project: true,
      tests: {
        orderBy: [{ status: 'desc' }, { titlePath: 'asc' }],
      },
    },
  });
  if (!run) notFound();

  const pendingDiffs = await loadPendingDiffs(runId, run.projectId);

  const failedFirst = [...run.tests].sort((a, b) => {
    const order = (s: string) =>
      s === 'failed' || s === 'unexpected' || s === 'timedOut' || s === 'interrupted'
        ? 0
        : s === 'flaky'
          ? 1
          : s === 'skipped'
            ? 3
            : 2;
    return order(a.status) - order(b.status) || a.titlePath.localeCompare(b.titlePath);
  });

  return (
    <div className="space-y-6">
      {run.status === 'running' && <AutoRefresh intervalMs={5_000} />}
      <div>
        <Link
          href="/"
          className="text-xs text-fg-subtle hover:text-fg-muted"
        >
          ← all runs
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {run.project.name}
              </h1>
              <RunStatusBadge status={run.status} />
            </div>
            <div className="mt-2">
              <BranchPr
                branch={run.branch}
                prNumber={run.prNumber}
                commitSha={run.commitSha}
                ciRunUrl={run.ciRunUrl}
              />
            </div>
          </div>
          <div className="text-right text-xs text-fg-subtle">
            <div>{formatRelativeTime(run.createdAt)}</div>
            <div className="font-mono">{formatDuration(run.durationMs)}</div>
          </div>
        </div>
      </div>

      <Summary run={run} />

      <BulkApprove runId={run.id} pending={pendingDiffs} />

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-panel">
        {failedFirst.map((t) => (
          <li key={t.id}>
            <Link
              href={`/runs/${run.id}/tests/${t.id}`}
              className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-bg-hover"
            >
              <div className="w-24 shrink-0">
                <TestStatusBadge status={t.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{t.titlePath}</div>
                <div className="mt-0.5 truncate font-mono text-xs text-fg-subtle">
                  {t.file}
                  {t.line ? `:${t.line}` : ''}
                  {t.projectName ? ` · ${t.projectName}` : ''}
                </div>
              </div>
              <span className="w-12 text-right font-mono text-xs text-fg-subtle">
                {formatDuration(t.durationMs)}
              </span>
              <ChevronRight className="h-4 w-4 text-fg-subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function loadPendingDiffs(
  runId: string,
  projectId: string,
): Promise<PendingDiff[]> {
  const actuals = await prisma.attachment.findMany({
    where: {
      snapshotKind: 'actual',
      testResult: { testCase: { runId } },
    },
    include: {
      testResult: { include: { testCase: true } },
    },
  });
  const diffNames = new Set(
    (
      await prisma.attachment.findMany({
        where: {
          snapshotKind: 'diff',
          testResult: { testCase: { runId } },
        },
        select: { snapshotName: true, testResult: { select: { testCaseId: true } } },
      })
    )
      .map((a) => `${a.testResult.testCaseId}::${a.snapshotName}`)
      .filter((s) => !s.endsWith('::null')),
  );
  const diffByKey = new Map<string, { src: string; percent?: number }>();
  const diffAttachments = await prisma.attachment.findMany({
    where: {
      snapshotKind: 'diff',
      testResult: { testCase: { runId } },
    },
    include: { testResult: true },
  });
  for (const d of diffAttachments) {
    if (!d.snapshotName) continue;
    diffByKey.set(`${d.testResult.testCaseId}::${d.snapshotName}`, {
      src: attachmentSrc(d.storagePath),
      percent: d.diffPercent ?? undefined,
    });
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

  return actuals
    .filter((a) => {
      if (!a.snapshotName) return false;
      const key = `${a.testResult.testCaseId}::${a.snapshotName}`;
      return diffNames.has(key) && !approvedFromIds.has(a.id);
    })
    .map((a) => {
      const tc = a.testResult.testCase;
      const key = `${a.testResult.testCaseId}::${a.snapshotName}`;
      const d = diffByKey.get(key);
      return {
        attachmentId: a.id,
        snapshotName: a.snapshotName ?? '',
        testTitle: tc.titlePath,
        testId: tc.id,
        actualSrc: attachmentSrc(a.storagePath),
        diffSrc: d?.src,
        diffPercent: d?.percent,
      };
    })
    // Highest-impact first so a sweep's heaviest changes are at the top.
    .sort((a, b) => (b.diffPercent ?? 0) - (a.diffPercent ?? 0));
}

function Summary({
  run,
}: {
  run: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    flakyTests: number;
    skippedTests: number;
  };
}) {
  const items = [
    { label: 'total', value: run.totalTests, color: 'text-fg' },
    { label: 'passed', value: run.passedTests, color: 'text-success' },
    { label: 'failed', value: run.failedTests, color: 'text-danger' },
    { label: 'flaky', value: run.flakyTests, color: 'text-warn' },
    { label: 'skipped', value: run.skippedTests, color: 'text-fg-subtle' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-md border border-border bg-bg-panel px-4 py-3"
        >
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
            {it.label}
          </div>
          <div className={`mt-1 font-mono text-2xl tabular-nums ${it.color}`}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}
