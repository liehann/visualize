import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftRight, GitCompare } from 'lucide-react';
import { prisma } from '@/lib/db';
import { BranchPr } from '@/components/branch-pr';
import { RunStatusBadge } from '@/components/status-badge';
import { formatRelativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PICKER_LIMIT = 30;

export default async function ComparePickerPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      projectId: true,
      branch: true,
      prNumber: true,
      commitSha: true,
      createdAt: true,
      project: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!run) notFound();

  const candidates = await prisma.run.findMany({
    where: { projectId: run.projectId, id: { not: runId } },
    orderBy: { createdAt: 'desc' },
    take: PICKER_LIMIT,
    select: {
      id: true,
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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/runs/${run.id}`}
          className="text-xs text-fg-subtle hover:text-fg-muted"
        >
          ← back to run
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <GitCompare className="h-5 w-5 text-fg-subtle" />
          <h1 className="text-xl font-semibold tracking-tight">
            Compare with another run
          </h1>
        </div>
        <p className="mt-1 text-sm text-fg-subtle">
          Pick a run to diff against the current one.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-bg-panel px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
          current run
        </div>
        <div className="mt-2 flex items-center gap-3">
          <BranchPr
            branch={run.branch}
            prNumber={run.prNumber}
            commitSha={run.commitSha}
          />
          <span className="text-xs text-fg-subtle">
            {formatRelativeTime(run.createdAt)}
          </span>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
          Recent runs in {run.project.name}
        </h2>
        {candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-bg-panel/60 px-4 py-8 text-center text-sm text-fg-subtle">
            No other runs in this project yet.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-panel">
            {candidates.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/runs/${run.id}/compare/${c.id}`}
                  className="flex items-center gap-3 px-5 py-2.5 text-xs hover:bg-bg-hover"
                >
                  <RunStatusBadge status={c.status} />
                  <BranchPr
                    branch={c.branch}
                    prNumber={c.prNumber}
                    commitSha={c.commitSha}
                  />
                  <span className="text-fg-subtle">
                    {c.passedTests}/{c.totalTests} passed
                  </span>
                  <span className="ml-auto whitespace-nowrap font-mono text-fg-subtle">
                    {formatRelativeTime(c.createdAt)}
                  </span>
                  <ArrowLeftRight className="h-3.5 w-3.5 text-fg-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
