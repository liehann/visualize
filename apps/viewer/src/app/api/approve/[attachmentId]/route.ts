import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { resolveDataPath, ensureDir } from '@visualize/core/storage';
import { computeSnapshotPath } from '@visualize/core/snapshot_path';

/**
 * Promote an "actual" screenshot to the new baseline.
 *
 * The canonical key on Baseline is `(projectId, path)` — `path` is the
 * repo-relative file location the consumer's playwright config expects on
 * disk. The next CI run will fetch this path back via /baselines/zip and
 * land it before Playwright executes.
 *
 * Path resolution prefers the value the parser stamped on the attachment
 * at ingest time (`attachment.snapshotPath`); we recompute as a fallback
 * when an older run pre-dates that column.
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
  const run = tc.run;
  const project = run.project;
  const browser = tc.projectName ?? 'any';
  const platform = run.platform;

  const baselinePath =
    attachment.snapshotPath ??
    computeSnapshotPath({
      template: project.snapshotPathTemplate,
      testDir: project.testDir,
      specFile: tc.file,
      projectName: tc.projectName ?? '',
      platform,
      arg: attachment.snapshotName,
    });
  if (!baselinePath) {
    return NextResponse.json(
      {
        error:
          'Could not compute baseline path. Check the project\'s snapshotPathTemplate and that the attachment was uploaded by a current ingest version.',
      },
      { status: 500 },
    );
  }

  // Sanitize the on-disk segment so a maliciously-crafted path can't
  // escape DATA_DIR/baselines/<projectId>/. The canonical `path` we store
  // in the row remains the original — what matters is what gets written
  // back to the consumer's filesystem on fetch, and the action only
  // accepts paths whose components are safe.
  const safePathSeg = baselinePath.replace(/[^a-zA-Z0-9._/-]/g, '_').slice(0, 400);
  const targetRel = path.posix.join('baselines', project.id, `${safePathSeg}.png`);
  const sourceAbs = resolveDataPath(attachment.storagePath);
  const targetAbs = resolveDataPath(targetRel);

  await ensureDir(path.dirname(targetAbs));
  await fs.copyFile(sourceAbs, targetAbs);
  const stat = await fs.stat(targetAbs);

  const baseline = await prisma.baseline.upsert({
    where: {
      projectId_path: { projectId: project.id, path: baselinePath },
    },
    create: {
      projectId: project.id,
      path: baselinePath,
      name: attachment.snapshotName,
      browser,
      platform,
      storagePath: targetRel,
      sizeBytes: stat.size,
      commitSha: run.commitSha ?? undefined,
      branch: run.branch ?? undefined,
      approvedFromAttachmentId: attachment.id,
      approvedBy: session.user.email ?? session.user.name ?? 'unknown',
      approvedAt: new Date(),
    },
    update: {
      name: attachment.snapshotName,
      browser,
      platform,
      storagePath: targetRel,
      sizeBytes: stat.size,
      commitSha: run.commitSha ?? undefined,
      branch: run.branch ?? undefined,
      approvedFromAttachmentId: attachment.id,
      approvedBy: session.user.email ?? session.user.name ?? 'unknown',
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    baselineId: baseline.id,
    snapshotName: baseline.name,
    path: baseline.path,
  });
}
