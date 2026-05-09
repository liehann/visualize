import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatRelativeTime } from '@/lib/format';
import { attachmentSrc } from '@/lib/attachment-url';
import { ApproveBaselineButton } from '../approve-baseline-button';

export const dynamic = 'force-dynamic';

export default async function PendingBaselinesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const pending = await prisma.baseline.findMany({
    where: { projectId: project.id, approvedAt: null },
    orderBy: [{ uploadedAt: 'desc' }, { path: 'asc' }],
  });

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/projects/${slug}`}
          className="text-xs text-fg-subtle hover:text-fg-muted"
        >
          ← {project.name}
        </Link>
        <div className="mt-2 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Pending baselines
          </h1>
          <span className="text-xs text-fg-subtle">
            {pending.length} awaiting review
          </span>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          First-time snapshots Playwright captured in CI. Approve to make
          each one the source of truth — the next CI run pulls it back into{' '}
          <code className="font-mono text-xs">__screenshots__/</code> and the
          test goes green.
        </p>
      </header>

      {pending.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-bg-panel/60 px-4 py-12 text-center text-sm text-fg-subtle">
          Nothing pending. CI will queue new candidates here when a test
          runs without an existing baseline.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {pending.map((b) => (
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
                    {b.commitSha ? ` · ${b.commitSha.slice(0, 7)}` : ''}
                  </span>
                  <ApproveBaselineButton baselineId={b.id} />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
