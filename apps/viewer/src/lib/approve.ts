import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { resolveDataPath, ensureDir } from '@visualize/core/storage';
import { computeSnapshotPath } from '@visualize/core/snapshot_path';

type AttachmentWithContext = NonNullable<
  Awaited<ReturnType<typeof loadAttachmentForApproval>>
>;

export async function loadAttachmentForApproval(attachmentId: string) {
  return prisma.attachment.findUnique({
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
}

export type ApproveResult =
  | { ok: true; baselineId: string; snapshotName: string; path: string }
  | { ok: false; status: number; error: string };

/**
 * Promote one "actual" attachment to a baseline. Single-row work shared by
 * the per-screenshot endpoint and the bulk-approve-in-run endpoint so the
 * file-copy + path-sanitization logic stays in one place.
 */
export async function approveActual(
  attachment: AttachmentWithContext,
  approvedBy: string,
): Promise<ApproveResult> {
  if (attachment.snapshotKind !== 'actual' || !attachment.snapshotName) {
    return { ok: false, status: 400, error: 'attachment is not an actual snapshot' };
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
    return {
      ok: false,
      status: 500,
      error:
        "Could not compute baseline path. Check the project's snapshotPathTemplate and that the attachment was uploaded by a current ingest version.",
    };
  }

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
      approvedBy,
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
      approvedBy,
      approvedAt: new Date(),
    },
  });

  return {
    ok: true,
    baselineId: baseline.id,
    snapshotName: baseline.name,
    path: baseline.path,
  };
}
