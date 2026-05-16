import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { TestStatusBadge } from '@/components/status-badge';
import { type SnapshotTriplet } from '@/components/snapshot-diff';
import { DiffGallery } from '@/components/diff-gallery';
import { fillExpectedFromBaselines } from '@/lib/triplet-baseline';
import { AttachmentViewer } from '@/components/attachment-viewer';
import { BranchPr } from '@/components/branch-pr';
import { PendingBaselineCard } from '@/components/pending-baseline-card';
import { findPendingBaselinesForTest } from '@/lib/pending-baselines';
import { formatDuration } from '@/lib/format';
import { attachmentSrc } from '@/lib/attachment-url';
import type { Attachment } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function TestPage({
  params,
}: {
  params: Promise<{ runId: string; testId: string }>;
}) {
  const { runId, testId } = await params;

  const test = await prisma.testCase.findFirst({
    where: { id: testId, runId },
    include: {
      run: { include: { project: true } },
      results: {
        orderBy: { retry: 'asc' },
        include: { attachments: true },
      },
    },
  });
  if (!test) notFound();

  const finalResult = test.results.at(-1);
  const finalAttachments = finalResult?.attachments ?? [];

  // Group snapshot triplets by snapshotName (across all retries we use the
  // final result's attachments — the last attempt is what matters for
  // approval).
  const triplets = groupSnapshotTriplets(finalAttachments);

  // Approval status: check if there's a Baseline whose source attachment id
  // matches any "actual" image we'd promote.
  const projectId = test.run.projectId;
  const baselines = await prisma.baseline.findMany({
    where: {
      projectId,
      name: { in: triplets.map((t) => t.snapshotName) },
    },
  });
  const approvedNames = new Set(
    baselines
      .filter((b) => {
        const tri = triplets.find((t) => t.snapshotName === b.name);
        return tri?.actual?.id && b.approvedFromAttachmentId === tri.actual.id;
      })
      .map((b) => b.name),
  );
  for (const t of triplets) {
    t.approved = approvedNames.has(t.snapshotName);
  }

  // Playwright rarely ships a usable `expected` image; the golden Baseline
  // is the real "before". Backfill so the diff viewer always has all three.
  const tripletsWithExpected = fillExpectedFromBaselines(triplets, baselines);

  // Non-snapshot attachments (videos, traces, errors, plain screenshots).
  const otherAttachments = finalAttachments.filter((a) => !a.snapshotName);

  // First-time-write candidates: when a result errored with "snapshot
  // doesn't exist… writing actual", Playwright wrote a fresh PNG that
  // the action's baseline-path step then uploaded as a Baseline. Find
  // those so reviewers can approve in-place instead of bouncing to the
  // separate /pending page.
  const pendingBaselines = await findPendingBaselinesForTest({
    projectId,
    errorMessages: test.results.map((r) => r.errorMessage),
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/runs/${runId}`}
          className="text-xs text-fg-subtle hover:text-fg-muted"
        >
          ← back to run
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {test.titlePath}
              </h1>
              <TestStatusBadge status={test.status} />
            </div>
            <div className="mt-1 truncate font-mono text-xs text-fg-subtle">
              {test.file}
              {test.line ? `:${test.line}` : ''}
              {test.projectName ? ` · ${test.projectName}` : ''}
            </div>
            <div className="mt-2">
              <BranchPr
                branch={test.run.branch}
                prNumber={test.run.prNumber}
                commitSha={test.run.commitSha}
              />
            </div>
          </div>
          <div className="text-right font-mono text-xs text-fg-subtle">
            {formatDuration(test.durationMs)}
          </div>
        </div>
      </div>

      {finalResult?.errorMessage && <ErrorPanel result={finalResult} />}

      {pendingBaselines.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
              New baseline{pendingBaselines.length === 1 ? '' : 's'} pending review
            </h2>
            <span className="text-[11px] text-fg-subtle">
              First-time snapshot — approve to land it as the source of truth.
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pendingBaselines.map((b) => (
              <PendingBaselineCard
                key={b.id}
                baselineId={b.id}
                name={b.name}
                path={b.path}
                src={attachmentSrc(b.storagePath)}
                width={b.width}
                height={b.height}
              />
            ))}
          </div>
        </section>
      )}

      {triplets.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Visual diffs
          </h2>
          <DiffGallery triplets={tripletsWithExpected} />
        </section>
      )}

      {otherAttachments.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Attachments
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {otherAttachments.map((a) => (
              <AttachmentViewer key={a.id} attachment={a} />
            ))}
          </div>
        </section>
      )}

      {!finalResult?.errorMessage &&
        triplets.length === 0 &&
        otherAttachments.length === 0 &&
        pendingBaselines.length === 0 && (
          <section className="rounded-lg border border-border bg-bg-panel px-4 py-6 text-sm text-fg-subtle">
            This test passed and Playwright captured no attachments — a green
            snapshot emits no actual/expected/diff images. The screenshot it
            asserted against is the current golden, browsable in{' '}
            <Link
              href={`/projects/${test.run.project.slug}`}
              className="text-fg-muted underline underline-offset-2 hover:text-fg"
            >
              {test.run.project.name} baselines
            </Link>
            .
          </section>
        )}

      {test.results.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Retries
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-panel">
            {test.results.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-2.5 text-xs"
              >
                <span className="w-16 font-mono text-fg-subtle">
                  retry {r.retry}
                </span>
                <TestStatusBadge status={r.status} />
                <span className="ml-auto font-mono text-fg-subtle">
                  {formatDuration(r.durationMs)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ErrorPanel({
  result,
}: {
  result: {
    errorMessage: string | null;
    errorStack: string | null;
    errorSnippet: string | null;
  };
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-danger/30 bg-danger/5">
      <header className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs font-medium text-danger">
        Failure
      </header>
      <div className="space-y-3 p-4">
        <pre className="whitespace-pre-wrap font-mono text-xs text-fg">
          {result.errorMessage}
        </pre>
        {result.errorSnippet && (
          <pre className="overflow-auto rounded border border-border-strong bg-bg-hover p-3 font-mono text-xs text-fg-muted">
            {result.errorSnippet}
          </pre>
        )}
        {result.errorStack && (
          <details>
            <summary className="cursor-pointer text-xs text-fg-subtle hover:text-fg-muted">
              stack trace
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded border border-border-strong bg-bg-hover p-3 font-mono text-[11px] text-fg-subtle">
              {result.errorStack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function groupSnapshotTriplets(attachments: Attachment[]): SnapshotTriplet[] {
  const map = new Map<string, SnapshotTriplet>();
  for (const a of attachments) {
    if (!a.snapshotName || !a.snapshotKind) continue;
    let entry = map.get(a.snapshotName);
    if (!entry) {
      entry = { snapshotName: a.snapshotName };
      map.set(a.snapshotName, entry);
    }
    const slot = { id: a.id, src: attachmentSrc(a.storagePath) };
    if (a.snapshotKind === 'actual') entry.actual = slot;
    if (a.snapshotKind === 'expected') entry.expected = slot;
    if (a.snapshotKind === 'diff') {
      entry.diff = slot;
      if (a.diffPercent !== null) entry.diffPercent = a.diffPercent;
      if (a.diffPixels !== null) entry.diffPixels = a.diffPixels;
    }
  }
  return [...map.values()];
}
