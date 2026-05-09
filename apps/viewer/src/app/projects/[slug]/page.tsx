import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { RunStatusBadge } from '@/components/status-badge';
import { BranchPr } from '@/components/branch-pr';
import { formatRelativeTime } from '@/lib/format';
import { attachmentSrc } from '@/lib/attachment-url';
import { ApproveBaselineButton } from './approve-baseline-button';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({
    where: { slug },
  });
  if (!project) notFound();

  const [pendingBaselines, approvedBaselines, recentRuns] = await Promise.all([
    prisma.baseline.findMany({
      where: { projectId: project.id, approvedAt: null },
      orderBy: { uploadedAt: 'desc' },
    }),
    prisma.baseline.findMany({
      where: { projectId: project.id, approvedAt: { not: null } },
      orderBy: { path: 'asc' },
      select: {
        id: true,
        path: true,
        approvedAt: true,
        approvedBy: true,
      },
    }),
    prisma.run.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        branch: true,
        prNumber: true,
        commitSha: true,
        createdAt: true,
        finishedAt: true,
      },
    }),
  ]);

  return (
    <div className="space-y-8">
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

      {pendingBaselines.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-warning">
              Pending baselines
            </h2>
            <p className="text-xs text-fg-subtle">
              {pendingBaselines.length} candidate
              {pendingBaselines.length === 1 ? '' : 's'} from CI — review and
              approve to make them the source of truth.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pendingBaselines.map((b) => (
              <article
                key={b.id}
                className="overflow-hidden rounded-lg border border-warning/30 bg-bg-panel"
              >
                <div className="bg-bg-hover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachmentSrc(b.storagePath)}
                    alt={b.path}
                    className="block max-h-[480px] w-full object-contain"
                  />
                </div>
                <div className="space-y-2 px-4 py-3">
                  <p className="break-all font-mono text-[11px] text-fg-muted">
                    {b.path}
                  </p>
                  <div className="flex items-center justify-between gap-3 text-xs text-fg-subtle">
                    <span>
                      uploaded {formatRelativeTime(b.uploadedAt)}
                      {b.commitSha
                        ? ` · ${b.commitSha.slice(0, 7)}`
                        : ''}
                    </span>
                    <ApproveBaselineButton baselineId={b.id} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Approved baselines
          </h2>
          <p className="text-xs text-fg-subtle">
            {approvedBaselines.length} approved
          </p>
        </div>
        {approvedBaselines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-bg-panel/60 px-4 py-8 text-center text-sm text-fg-subtle">
            No approved baselines yet. CI uploads candidates here when
            Playwright writes a missing snapshot for the first time.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-panel text-xs">
            {approvedBaselines.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="font-mono text-fg-muted truncate">{b.path}</span>
                <span className="ml-auto whitespace-nowrap text-fg-subtle">
                  approved by {b.approvedBy ?? 'unknown'}
                  {b.approvedAt
                    ? ` · ${formatRelativeTime(b.approvedAt)}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
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
