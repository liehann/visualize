import Link from 'next/link';
import { prisma } from '@/lib/db';
import { RunStatusBadge } from '@/components/status-badge';
import { BranchPr } from '@/components/branch-pr';
import { Sparkline } from '@/components/sparkline';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import {
  CircleCheck,
  CircleX,
  CircleAlert,
  CircleDashed,
  Activity,
  Plus,
} from 'lucide-react';
import { AutoRefresh } from '@/components/auto-refresh';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 30,
      },
    },
  });

  return (
    <div className="space-y-8">
      <AutoRefresh />
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Visual regression and Playwright runs across {projects.length}{' '}
            project{projects.length === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-fg-subtle">
            {projects.reduce((acc, p) => acc + p.runs.length, 0)} recent runs
          </span>
          {projects.length > 0 && (
            <Link
              href="/projects/new"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-bg-panel px-3 text-xs font-medium hover:bg-bg-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </Link>
          )}
        </div>
      </header>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
}: {
  project: {
    id: string;
    name: string;
    slug: string;
    runs: Array<{
      id: string;
      status: 'passed' | 'failed' | 'flaky' | 'running' | 'cancelled';
      branch: string | null;
      prNumber: number | null;
      commitSha: string | null;
      ciRunUrl: string | null;
      createdAt: Date;
      durationMs: number | null;
      totalTests: number;
      passedTests: number;
      failedTests: number;
      flakyTests: number;
      skippedTests: number;
    }>;
  };
}) {
  const latest = project.runs[0];
  const passRate =
    project.runs.length === 0
      ? null
      : Math.round(
          (project.runs.filter((r) => r.status === 'passed').length /
            project.runs.length) *
            100,
        );

  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-bg-panel transition-colors hover:border-border-strong">
      <header className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-accent" />
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {project.name}
            </h2>
          </div>
          <p className="mt-1 font-mono text-xs text-fg-subtle">
            {project.slug}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
            pass rate
          </div>
          <div
            className={`mt-0.5 font-mono text-xl tabular-nums ${
              passRate == null
                ? 'text-fg-subtle'
                : passRate >= 95
                  ? 'text-success'
                  : passRate >= 80
                    ? 'text-warn'
                    : 'text-danger'
            }`}
          >
            {passRate == null ? '—' : `${passRate}%`}
          </div>
        </div>
      </header>

      <div className="flex items-end justify-between gap-4 border-b border-border px-5 py-3">
        <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
          last {project.runs.length} runs
        </div>
        <Sparkline runs={project.runs} />
      </div>

      {latest ? (
        <Link
          href={`/runs/${latest.id}`}
          className="block px-5 py-4 transition-colors hover:bg-bg-hover"
        >
          <div className="flex items-center gap-3">
            <RunStatusBadge status={latest.status} />
            <span className="text-xs text-fg-subtle">
              {formatRelativeTime(latest.createdAt)}
            </span>
            <span className="ml-auto font-mono text-xs text-fg-subtle">
              {formatDuration(latest.durationMs)}
            </span>
          </div>
          <div className="mt-2.5">
            <BranchPr
              branch={latest.branch}
              prNumber={latest.prNumber}
              commitSha={latest.commitSha}
              ciRunUrl={latest.ciRunUrl}
            />
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs font-mono text-fg-muted">
            <Stat icon={CircleCheck} value={latest.passedTests} className="text-success" />
            <Stat icon={CircleX} value={latest.failedTests} className="text-danger" />
            <Stat icon={CircleAlert} value={latest.flakyTests} className="text-warn" />
            <Stat
              icon={CircleDashed}
              value={latest.skippedTests}
              className="text-fg-subtle"
            />
            <span className="ml-auto text-fg-subtle">
              {latest.totalTests} tests
            </span>
          </div>
        </Link>
      ) : (
        <div className="px-5 py-8 text-center text-sm text-fg-subtle">
          No runs yet
        </div>
      )}

      {project.runs.length > 1 && (
        <RunMiniList runs={project.runs.slice(1, 6)} />
      )}
    </article>
  );
}

function RunMiniList({
  runs,
}: {
  runs: Array<{
    id: string;
    status: 'passed' | 'failed' | 'flaky' | 'running' | 'cancelled';
    branch: string | null;
    prNumber: number | null;
    commitSha: string | null;
    createdAt: Date;
    durationMs: number | null;
  }>;
}) {
  return (
    <ul className="divide-y divide-border border-t border-border">
      {runs.map((r) => (
        <li key={r.id}>
          <Link
            href={`/runs/${r.id}`}
            className="flex items-center gap-3 px-5 py-2 text-xs transition-colors hover:bg-bg-hover"
          >
            <RunStatusBadge status={r.status} />
            <span className="truncate text-fg-muted">
              {r.prNumber != null ? `PR #${r.prNumber}` : r.branch ?? '—'}
            </span>
            <span className="ml-auto font-mono text-fg-subtle">
              {formatRelativeTime(r.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
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
    <div className="rounded-xl border border-dashed border-border bg-bg-panel p-12 text-center">
      <h2 className="text-lg font-medium">No projects yet</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-muted">
        Connect a GitHub repo and Visualize will give you a per-project token,
        a ready-made GitHub Action snippet, and live confirmation when your
        first report lands.
      </p>
      <div className="mt-6">
        <Link
          href="/projects/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90"
        >
          Connect a GitHub repo
        </Link>
      </div>
    </div>
  );
}
