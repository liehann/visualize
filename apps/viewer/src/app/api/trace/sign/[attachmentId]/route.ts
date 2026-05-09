import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { signTraceToken } from '@/lib/signed-trace';
import { env } from '@/env';

/**
 * Mint a 5-minute signed URL for serving a trace attachment on the
 * unauthenticated `/api/trace/raw/[attachmentId]` endpoint, which is
 * what trace.playwright.dev fetches as it can't carry our session
 * cookie (different origin). Returns both the signed token and the
 * fully-resolved viewer URL pointing to trace.playwright.dev.
 */
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
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, contentType: true, name: true, kind: true },
    });
    if (!attachment) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (attachment.kind !== 'trace') {
      return NextResponse.json(
        { error: 'attachment is not a trace' },
        { status: 400 },
      );
    }

    const token = signTraceToken(attachmentId);
    const base = env.VIEWER_URL?.replace(/\/$/, '') ?? '';
    const traceRawUrl = `${base}/api/trace/raw/${attachmentId}?token=${token}`;
    const playwrightTraceUrl = `https://trace.playwright.dev/?trace=${encodeURIComponent(traceRawUrl)}`;
    return NextResponse.json({
      ok: true,
      token,
      traceRawUrl,
      playwrightTraceUrl,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[trace/sign] failed', { msg });
    return NextResponse.json(
      { error: 'sign failed', detail: msg },
      { status: 500 },
    );
  }
}
