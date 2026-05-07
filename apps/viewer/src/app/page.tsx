import Link from 'next/link';
import { prisma } from '@/lib/db';
import { RunStatusBadge } from '@/components/status-badge';
import { BranchPr } from '@/components/branch-pr';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import { CircleCheck, CircleX, CircleAlert, CircleDashed } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const runs = await prisma.run.findMany({
    take: 50,
    orderBy: { createdAt: 'desc' },
    include: { project: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recent runs</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Most recent Playwright runs across all projects.
          </p>
        </div>
      </div>

      {runs.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-panel">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/runs/${run.id}`}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-bg-hover"
              >
                <div className="flex w-32 shrink-0 items-center gap-2">
                  <RunStatusBadge status={run.status} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-medium text-fg">
                      {run.project.name}
                    </span>
                    <span className="text-xs text-fg-subtle">
                      {formatRelativeTime(run.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <BranchPr
                      branch={run.branch}
                      prNumber={run.prNumber}
                      commitSha={run.commitSha}
                      ciRunUrl={run.ciRunUrl}
                    />
                  </div>
                </div>

                <RunCounts run={run} />
                <span className="w-14 text-right font-mono text-xs text-fg-subtle">
                  {formatDuration(run.durationMs)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RunCounts({
  run,
}: {
  run: {
    passedTests: number;
    failedTests: number;
    flakyTests: number;
    skippedTests: number;
  };
}) {
  return (
    <div className="hidden items-center gap-4 text-xs font-mono text-fg-muted md:flex">
      <Stat icon={CircleCheck} value={run.passedTests} className="text-success" />
      <Stat icon={CircleX} value={run.failedTests} className="text-danger" />
      <Stat icon={CircleAlert} value={run.flakyTests} className="text-warn" />
      <Stat
        icon={CircleDashed}
        value={run.skippedTests}
        className="text-fg-subtle"
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  className?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Icon className={`h-3.5 w-3.5 ${className ?? ''}`} />
      {value}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-bg-panel p-12 text-center">
      <h2 className="text-base font-medium">No runs yet</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Upload a Playwright report from CI to see it here.
      </p>
      <pre className="mx-auto mt-5 inline-block rounded border border-border-strong bg-bg-hover px-4 py-3 text-left font-mono text-xs text-fg-muted">
        {`curl -X POST https://ingest.your-domain/runs \\
  -H "Authorization: Bearer $API_SECRET" \\
  -F 'meta={"projectSlug":"web","branch":"main","commitSha":"$GITHUB_SHA"}' \\
  -F 'bundle=@playwright-report.zip'`}
      </pre>
    </div>
  );
}
