import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { approveActual } from '@/lib/approve';
import { refreshDiffStatusForRun } from '@/lib/diff-status';

/**
 * Bulk-approve every pending visual diff in a run. "Pending" means:
 * - the actual snapshot has a sibling diff attachment (Playwright wrote a
 *   diff PNG → there was a real visual change), AND
 * - no Baseline currently points at this attachment as its source.
 *
 * Returns a per-attachment result list so the caller can show partial
 * failures without aborting the whole sweep.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { id: true, projectId: true },
  });
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  const pending = await loadPendingAttachments(runId, run.projectId);
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, approved: 0, results: [] });
  }

  const approvedBy = session.user.email ?? session.user.name ?? 'unknown';
  const results: Array<{
    attachmentId: string;
    snapshotName: string;
    ok: boolean;
    error?: string;
  }> = [];
  for (const a of pending) {
    const r = await approveActual(a, approvedBy);
    if (r.ok) {
      results.push({ attachmentId: a.id, snapshotName: r.snapshotName, ok: true });
    } else {
      results.push({
        attachmentId: a.id,
        snapshotName: a.snapshotName ?? '',
        ok: false,
        error: r.error,
      });
    }
  }

  const approved = results.filter((r) => r.ok).length;
  // Best-effort GitHub merge-gate update.
  void refreshDiffStatusForRun(runId);
  return NextResponse.json({ ok: true, approved, results });
}

async function loadPendingAttachments(runId: string, projectId: string) {
  const attachments = await prisma.attachment.findMany({
    where: {
      snapshotKind: 'actual',
      testResult: { testCase: { runId } },
    },
    include: {
      testResult: {
        include: {
          testCase: {
            include: { run: { include: { project: true } } },
          },
        },
      },
    },
  });

  const diffNames = new Set(
    (
      await prisma.attachment.findMany({
        where: {
          snapshotKind: 'diff',
          testResult: { testCase: { runId } },
        },
        select: { snapshotName: true },
      })
    )
      .map((a) => a.snapshotName)
      .filter((n): n is string => !!n),
  );

  const approvedFromIds = new Set(
    (
      await prisma.baseline.findMany({
        where: {
          projectId,
          approvedFromAttachmentId: { in: attachments.map((a) => a.id) },
        },
        select: { approvedFromAttachmentId: true },
      })
    )
      .map((b) => b.approvedFromAttachmentId)
      .filter((id): id is string => !!id),
  );

  return attachments.filter(
    (a) =>
      a.snapshotName &&
      diffNames.has(a.snapshotName) &&
      !approvedFromIds.has(a.id),
  );
}
