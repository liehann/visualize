import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftRight, GitCompare } from 'lucide-react';
import { compareRuns } from '@/lib/run-comparison';
import { BranchPr } from '@/components/branch-pr';
import { TestStatusBadge } from '@/components/status-badge';
import { formatRelativeTime } from '@/lib/format';
import { RunVsRunDiff, type RunVsRunTriplet } from '@/components/run-vs-run-diff';
import type { TestStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function ComparePage({
  params,
}: {
  params: Promise<{ runId: string; otherRunId: string }>;
}) {
  const { runId, otherRunId } = await params;
  // URL convention: /runs/<B>/compare/<A> — `B` is the run the user is on
  // (the candidate change), `A` is the chosen baseline. Pass A first to
  // compareRuns so the result reads "from A to B".
  const result = await compareRuns(otherRunId, runId);
  if (!result) notFound();

  const { runA, runB, project, statusChanges, visualChanges, matchedTestCount, comparedSnapshotCount } =
    result;

  const labelA = runLabel(runA);
  const labelB = runLabel(runB);
  const noChanges = statusChanges.length === 0 && visualChanges.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/runs/${runB.id}`}
          className="text-xs text-fg-subtle hover:text-fg-muted"
        >
          ← back to run
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <GitCompare className="h-5 w-5 text-fg-subtle" />
          <h1 className="text-xl font-semibold tracking-tight">
            {project.name} — comparing runs
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <RunCard run={runA} label="from" href={`/runs/${runA.id}`} />
        <div className="hidden items-center justify-center text-fg-subtle md:flex">
          <ArrowLeftRight className="h-5 w-5" />
        </div>
        <RunCard run={runB} label="to" href={`/runs/${runB.id}`} accent />
      </div>

      <div className="rounded-lg border border-border bg-bg-panel px-4 py-3 text-xs text-fg-subtle">
        <span>
          {matchedTestCount} test{matchedTestCount === 1 ? '' : 's'} matched ·{' '}
          {statusChanges.length} status change{statusChanges.length === 1 ? '' : 's'} ·{' '}
          {comparedSnapshotCount} snapshot{comparedSnapshotCount === 1 ? '' : 's'} changed
        </span>
      </div>

      {noChanges && (
        <div className="rounded-lg border border-dashed border-border bg-bg-panel/60 px-4 py-12 text-center text-sm text-fg-subtle">
          No status or visual changes between these runs.
        </div>
      )}

      {statusChanges.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Status changes
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-panel">
            {statusChanges.map((c) => (
              <li
                key={c.testKey}
                className="flex items-center gap-3 px-5 py-2.5 text-xs"
              >
                <KindLabel kind={c.kind} />
                <div className="flex items-center gap-1.5">
                  {c.fromStatus ? (
                    <TestStatusBadge status={c.fromStatus as TestStatus} />
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                  <span className="text-fg-subtle">→</span>
                  {c.toStatus ? (
                    <TestStatusBadge status={c.toStatus as TestStatus} />
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {c.testIdB ? (
                    <Link
                      href={`/runs/${runB.id}/tests/${c.testIdB}`}
                      className="block min-w-0 truncate text-sm text-fg hover:text-accent"
                    >
                      {c.testTitle}
                    </Link>
                  ) : c.testIdA ? (
                    <Link
                      href={`/runs/${runA.id}/tests/${c.testIdA}`}
                      className="block min-w-0 truncate text-sm text-fg hover:text-accent"
                    >
                      {c.testTitle}
                    </Link>
                  ) : (
                    <span className="block min-w-0 truncate text-sm text-fg">{c.testTitle}</span>
                  )}
                  <div className="mt-0.5 truncate font-mono text-xs text-fg-subtle">
                    {c.testFile}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visualChanges.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Visual changes
          </h2>
          <div className="space-y-4">
            {visualChanges.map((v) => {
              const triplet: RunVsRunTriplet = {
                kind: v.kind,
                snapshotName: v.snapshotName,
                actualA: v.actualASrc ?? undefined,
                actualB: v.actualBSrc ?? undefined,
                diffPercent: v.diffPercent ?? undefined,
                testTitle: v.testTitle,
              };
              return (
                <RunVsRunDiff
                  key={`${v.testKey}::${v.snapshotName}`}
                  triplet={triplet}
                  labelA={labelA}
                  labelB={labelB}
                  hrefA={v.testIdA ? `/runs/${runA.id}/tests/${v.testIdA}` : undefined}
                  hrefB={v.testIdB ? `/runs/${runB.id}/tests/${v.testIdB}` : undefined}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function runLabel(r: { branch: string | null; prNumber: number | null; commitSha: string | null }): string {
  if (r.prNumber != null) return `PR #${r.prNumber}`;
  if (r.branch) return r.branch;
  if (r.commitSha) return r.commitSha.slice(0, 7);
  return 'run';
}

function KindLabel({ kind }: { kind: 'regressed' | 'fixed' | 'added' | 'removed' }) {
  const tone =
    kind === 'regressed'
      ? 'border-danger/40 bg-danger/10 text-danger'
      : kind === 'fixed'
        ? 'border-success/40 bg-success/10 text-success'
        : kind === 'added'
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-fg-subtle/30 bg-fg-subtle/10 text-fg-subtle';
  return (
    <span
      className={`inline-flex h-5 w-20 shrink-0 items-center justify-center rounded border px-1.5 text-[10px] uppercase tracking-wider ${tone}`}
    >
      {kind}
    </span>
  );
}

function RunCard({
  run,
  label,
  href,
  accent,
}: {
  run: {
    id: string;
    branch: string | null;
    prNumber: number | null;
    commitSha: string | null;
    ciRunUrl: string | null;
    createdAt: Date;
    totalTests: number;
    passedTests: number;
    failedTests: number;
  };
  label: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border bg-bg-panel px-4 py-3 hover:bg-bg-hover ${
        accent ? 'border-accent/40' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-fg-subtle">
          {label}
        </span>
        <span className="text-xs text-fg-subtle">{formatRelativeTime(run.createdAt)}</span>
      </div>
      <div className="mt-2">
        <BranchPr
          branch={run.branch}
          prNumber={run.prNumber}
          commitSha={run.commitSha}
          ciRunUrl={run.ciRunUrl}
        />
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-fg-subtle">
        <span>
          <span className="text-success">{run.passedTests}</span>/{run.totalTests} passed
        </span>
        {run.failedTests > 0 && (
          <span className="text-danger">{run.failedTests} failed</span>
        )}
      </div>
    </Link>
  );
}
