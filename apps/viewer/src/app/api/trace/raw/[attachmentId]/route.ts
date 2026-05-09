import { NextResponse } from 'next/server';
import { promises as fs, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { prisma } from '@/lib/db';
import { resolveDataPath } from '@visualize/core/storage';
import { verifyTraceToken } from '@/lib/signed-trace';

/**
 * Public, token-gated trace.zip delivery. Used by trace.playwright.dev
 * which fetches from a different origin and can't carry our session
 * cookie. Token is HMAC-signed by AUTH_SECRET, includes the attachment
 * id + expiry, and is valid for 5 minutes from issuance.
 *
 * Middleware whitelists this path so it bypasses the OIDC redirect.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'missing token' }, { status: 401 });
    }
    const verified = verifyTraceToken(token);
    if (!verified) {
      return NextResponse.json(
        { error: 'invalid or expired token' },
        { status: 403 },
      );
    }

    const { attachmentId } = await params;
    if (verified.attachmentId !== attachmentId) {
      return NextResponse.json(
        { error: 'token does not match attachment' },
        { status: 403 },
      );
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { storagePath: true, contentType: true, kind: true, name: true },
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

    const abs = resolveDataPath(attachment.storagePath);
    const stat = await fs.stat(abs);
    const stream = Readable.toWeb(createReadStream(abs)) as unknown as ReadableStream;

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': attachment.contentType ?? 'application/zip',
        'Content-Length': String(stat.size),
        // CORS: allow trace.playwright.dev to fetch + read.
        'Access-Control-Allow-Origin': 'https://trace.playwright.dev',
        // Short cache so a re-issued token doesn't get stale bytes.
        'Cache-Control': 'private, max-age=60',
        // Suggest a filename if someone downloads via the URL directly.
        'Content-Disposition': `inline; filename="${attachment.name}.zip"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[trace/raw] failed', { msg });
    return NextResponse.json(
      { error: 'serve failed', detail: msg },
      { status: 500 },
    );
  }
}
