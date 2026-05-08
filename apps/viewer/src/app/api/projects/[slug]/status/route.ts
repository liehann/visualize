import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
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
    select: {
      tokenLastUsedAt: true,
      _count: { select: { runs: true } },
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({
    runs: project._count.runs,
    latestRunId: project.runs[0]?.id ?? null,
    tokenLastUsedAt: project.tokenLastUsedAt?.toISOString() ?? null,
  });
}
