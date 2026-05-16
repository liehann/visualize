import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { RunStatusBadge } from '@/components/status-badge';
import { BranchPr } from '@/components/branch-pr';
import { formatRelativeTime } from '@/lib/format';
import { CircleAlert } from 'lucide-react';
import { BaselineGallery } from '@/components/baseline-gallery';
import { attachmentSrc } from '@/lib/attachment-url';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const [pendingCount, baselines, recentRuns] = await Promise.all([
    prisma.baseline.count({
      where: { projectId: project.id, approvedAt: null },
    }),
    prisma.baseline.findMany({
      where: { projectId: project.id },
      orderBy: { name: 'asc' },
      take: 300,
      select: {
        id: true,
        name: true,
        browser: true,
        platform: true,
        storagePath: true,
      },
    }),
    prisma.run.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        status: true,
        branch: true,
        prNumber: true,
        commitSha: true,
        createdAt: true,
        finishedAt: true,
        durationMs: true,
        totalTests: true,
        passedTests: true,
        failedTests: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/"
          className="text-xs text-fg-subtle hover:text-fg-muted"
        >
          ← projects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <p className="mt-1 font-mono text-xs text-fg-subtle">{project.slug}</p>
      </header>

      {pendingCount > 0 && (
        <Link
          href={`/projects/${slug}/pending`}
          className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm hover:bg-warning/15"
        >
          <CircleAlert className="h-4 w-4 shrink-0 text-warning" />
          <span className="flex-1">
            <span className="font-medium text-warning">
              {pendingCount} baseline{pendingCount === 1 ? '' : 's'} awaiting
              review
            </span>{' '}
            <span className="text-fg-muted">
              — first-time captures from CI; tests stay red until approved.
            </span>
          </span>
          <span className="whitespace-nowrap text-xs font-medium text-warning">
            Review →
          </span>
        </Link>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Current baselines
          </h2>
          <p className="text-xs text-fg-subtle">
            {baselines.length} screenshot{baselines.length === 1 ? '' : 's'} — what
            every passing snapshot looks like today
          </p>
        </div>
        <BaselineGallery
          baselines={baselines.map((b) => ({
            id: b.id,
            name: b.name,
            browser: b.browser,
            platform: b.platform,
            src: attachmentSrc(b.storagePath),
          }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
          Recent runs
        </h2>
        {recentRuns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-bg-panel/60 px-4 py-8 text-center text-sm text-fg-subtle">
            No runs uploaded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-panel">
            {recentRuns.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/runs/${r.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-bg-hover"
                >
                  <RunStatusBadge status={r.status} />
                  <BranchPr
                    branch={r.branch}
                    prNumber={r.prNumber}
                    commitSha={r.commitSha}
                  />
                  <span className="text-fg-subtle">
                    {r.passedTests}/{r.totalTests} passed
                  </span>
                  <span className="ml-auto whitespace-nowrap font-mono text-fg-subtle">
                    {formatRelativeTime(r.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
