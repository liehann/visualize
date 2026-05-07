import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { auth } from '@/auth';
import { resolveDataPath } from '@visualize/core/storage';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.zip': 'application/zip',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await auth();
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { path: segs } = await params;
  let absolute: string;
  try {
    absolute = resolveDataPath(...segs);
  } catch {
    return new NextResponse('Bad path', { status: 400 });
  }

  let stat;
  try {
    stat = statSync(absolute);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!stat.isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = path.extname(absolute).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';

  const nodeStream = createReadStream(absolute);
  // Convert Node stream to Web ReadableStream for NextResponse.
  const stream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(stat.size),
      'Cache-Control': 'private, max-age=300',
    },
  });
}
