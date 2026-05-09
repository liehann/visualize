import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { approveActual, loadAttachmentForApproval } from '@/lib/approve';
import { refreshDiffStatusForRun } from '@/lib/diff-status';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { attachmentId } = await params;
  const attachment = await loadAttachmentForApproval(attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const approvedBy = session.user.email ?? session.user.name ?? 'unknown';
  const result = await approveActual(attachment, approvedBy);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // Best-effort: flip the GitHub merge gate to success once the run has
  // no remaining unapproved diffs. Silent no-op without VIEWER_GITHUB_TOKEN.
  void refreshDiffStatusForRun(attachment.testResult.testCase.runId);
  return NextResponse.json(result);
}
