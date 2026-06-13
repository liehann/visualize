import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { RunStatusBadge, TestStatusBadge } from '@/components/status-badge';
import { BranchPr } from '@/components/branch-pr';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import { ChevronLeft, ChevronRight, GitCompare } from 'lucide-react';
import { AutoRefresh } from '@/components/auto-refresh';
import { BulkApprove } from '@/components/bulk-approve';
import { loadRunDiffs, runDiffsToTriplets } from '@/lib/run-diffs';

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

  const runDiffs = await loadRunDiffs(runId, run.projectId);
  const diffTriplets = runDiffsToTriplets(
    runDiffs,
    (d) => `/runs/${runId}/tests/${d.testId}`,
  );

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
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
        >
          <ChevronLeft className="h-4 w-4" />
          all runs
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
          <div className="flex flex-col items-end gap-2 text-xs text-fg-subtle">
            <div className="text-right">
              <div>{formatRelativeTime(run.createdAt)}</div>
              <div className="font-mono">{formatDuration(run.durationMs)}</div>
            </div>
            <Link
              href={`/runs/${run.id}/compare`}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-bg-panel px-2 py-1 text-xs text-fg hover:bg-bg-hover"
            >
              <GitCompare className="h-3.5 w-3.5" />
              compare
            </Link>
          </div>
        </div>
      </div>

      <Summary run={run} />

      <BulkApprove runId={run.id} triplets={diffTriplets} />

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
