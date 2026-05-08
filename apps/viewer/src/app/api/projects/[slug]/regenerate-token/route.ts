import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { generateUploadToken, hashUploadToken } from '@visualize/core/tokens';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const token = generateUploadToken();
  await prisma.project.update({
    where: { id: project.id },
    data: {
      uploadTokenHash: hashUploadToken(token),
      tokenLastUsedAt: null,
    },
  });

  return NextResponse.json({ token });
}
