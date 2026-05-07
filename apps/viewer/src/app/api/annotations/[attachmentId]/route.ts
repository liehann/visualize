import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { AnnotationShapeSchema } from '@visualize/core/types';
import { z } from 'zod';

const PostBody = z.object({
  shape: AnnotationShapeSchema,
  label: z.string().max(120).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { attachmentId } = await params;
  const annotations = await prisma.annotation.findMany({
    where: { attachmentId },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ annotations });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { attachmentId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const exists = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const annotation = await prisma.annotation.create({
    data: {
      attachmentId,
      shape: parsed.data.shape,
      label: parsed.data.label ?? null,
      author: session.user.email ?? session.user.name ?? 'unknown',
      source: 'human',
    },
  });
  return NextResponse.json({ annotation }, { status: 201 });
}
