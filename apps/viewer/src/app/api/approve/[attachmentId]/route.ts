import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { approveActual, loadAttachmentForApproval } from '@/lib/approve';
import { refreshDiffStatusForRun } from '@/lib/diff-status';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  try {
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
  } catch (err) {
    // Surface the real cause to the caller. Without this, an
    // unhandled exception (e.g. EROFS / ENOENT from a misconfigured
    // volume mount) becomes an opaque 500 with no body — the client
    // can only show "approve failed (500)". Auth-gated, so echoing
    // the message back isn't an information-disclosure concern.
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[approve/attachment] failed', { msg, stack });
    return NextResponse.json(
      { error: 'attachment approve failed', detail: msg },
      { status: 500 },
    );
  }
}
