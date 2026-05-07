import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { resolveDataPath, ensureDir } from '@visualize/core/storage';

/**
 * Promote an "actual" screenshot to the new baseline for its (project,
 * snapshotName, browser, platform) tuple.
 *
 * Per-screenshot one-click approve: the user clicks once on the diff card,
 * we copy the actual image into the baselines directory and upsert the
 * Baseline row.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { attachmentId } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
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
  if (!attachment) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (attachment.snapshotKind !== 'actual' || !attachment.snapshotName) {
    return NextResponse.json(
      { error: 'attachment is not an actual snapshot' },
      { status: 400 },
    );
  }

  const tc = attachment.testResult.testCase;
  const project = tc.run.project;
  const browser = tc.projectName ?? null;
  const platform = process.platform; // baselines are platform-keyed in Playwright
  const safeName = attachment.snapshotName.replace(/[^a-zA-Z0-9._-]/g, '_');

  const targetRel = path.posix.join(
    'baselines',
    project.id,
    `${safeName}__${browser ?? 'any'}__${platform}.png`,
  );
  const sourceAbs = resolveDataPath(attachment.storagePath);
  const targetAbs = resolveDataPath(targetRel);

  await ensureDir(path.dirname(targetAbs));
  await fs.copyFile(sourceAbs, targetAbs);
  const stat = await fs.stat(targetAbs);

  const baseline = await prisma.baseline.upsert({
    where: {
      projectId_name_browser_platform: {
        projectId: project.id,
        name: attachment.snapshotName,
        browser,
        platform,
      },
    },
    create: {
      projectId: project.id,
      name: attachment.snapshotName,
      browser,
      platform,
      storagePath: targetRel,
      sizeBytes: stat.size,
      commitSha: tc.run.commitSha,
      branch: tc.run.branch,
      approvedFromAttachmentId: attachment.id,
      approvedBy: session.user.email ?? session.user.name ?? 'unknown',
      approvedAt: new Date(),
    },
    update: {
      storagePath: targetRel,
      sizeBytes: stat.size,
      commitSha: tc.run.commitSha,
      branch: tc.run.branch,
      approvedFromAttachmentId: attachment.id,
      approvedBy: session.user.email ?? session.user.name ?? 'unknown',
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    baselineId: baseline.id,
    snapshotName: baseline.name,
  });
}
