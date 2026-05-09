import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

/**
 * Approve a candidate Baseline that was uploaded via the action's
 * `baseline-path` step (which doesn't set `approvedAt` — it just
 * captures the bytes Playwright wrote on first-time-snapshot).
 *
 * The fetch endpoint filters on `approvedAt IS NOT NULL`, so a baseline
 * stays out of CI's reach until a human flips this bit. That's the
 * approve gate the viewer is supposed to be the only path through.
 *
 * For approving by promoting an actual attachment from a failed run
 * (the diff case), use /api/approve/[attachmentId] instead — that one
 * also copies the actual's bytes into the baseline storagePath.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const baseline = await prisma.baseline.findUnique({
    where: { id },
    select: { id: true, path: true, approvedAt: true },
  });
  if (!baseline) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (baseline.approvedAt) {
    return NextResponse.json({
      ok: true,
      already: true,
      baselineId: baseline.id,
      path: baseline.path,
    });
  }

  const updated = await prisma.baseline.update({
    where: { id },
    data: {
      approvedBy: session.user.email ?? session.user.name ?? 'unknown',
      approvedAt: new Date(),
    },
    select: { id: true, path: true, approvedAt: true, approvedBy: true },
  });

  return NextResponse.json({
    ok: true,
    baselineId: updated.id,
    path: updated.path,
    approvedAt: updated.approvedAt,
    approvedBy: updated.approvedBy,
  });
}
