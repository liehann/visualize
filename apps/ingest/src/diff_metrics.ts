import { promises as fs } from 'node:fs';
import { prisma } from '@visualize/core/db';
import { resolveDataPath } from '@visualize/core/storage';
import { computeDiffMetric } from '@visualize/core/diff_metrics';

type Attachment = {
  id: string;
  storagePath: string;
  snapshotKind: 'actual' | 'expected' | 'diff' | null;
  snapshotName: string | null;
  testResultId: string;
};

/**
 * For every snapshot triplet in the run that has both expected + actual,
 * run pixelmatch (via @visualize/core/diff_metrics) and stamp the
 * resulting pixel-mismatch + percentage on the diff attachment.
 *
 * Failure modes are individually swallowed: a single corrupt PNG must
 * not abort the whole sweep, so the run is still ingested cleanly even
 * if one screenshot is unreadable.
 */
export async function computeDiffMetricsForRun(
  runId: string,
): Promise<{ updated: number; skipped: number }> {
  const attachments = (await prisma.attachment.findMany({
    where: {
      snapshotKind: { in: ['actual', 'expected', 'diff'] },
      testResult: { testCase: { runId } },
    },
    select: {
      id: true,
      storagePath: true,
      snapshotKind: true,
      snapshotName: true,
      testResultId: true,
    },
  })) as Attachment[];

  const groups = new Map<
    string,
    { actual?: Attachment; expected?: Attachment; diff?: Attachment }
  >();
  for (const a of attachments) {
    if (!a.snapshotName || !a.snapshotKind) continue;
    const key = `${a.testResultId}::${a.snapshotName}`;
    let g = groups.get(key);
    if (!g) {
      g = {};
      groups.set(key, g);
    }
    g[a.snapshotKind] = a;
  }

  let updated = 0;
  let skipped = 0;
  for (const g of groups.values()) {
    if (!g.diff || !g.actual || !g.expected) continue;
    try {
      const [expectedBytes, actualBytes] = await Promise.all([
        fs.readFile(resolveDataPath(g.expected.storagePath)),
        fs.readFile(resolveDataPath(g.actual.storagePath)),
      ]);
      const metric = await computeDiffMetric(expectedBytes, actualBytes);
      if (!metric) {
        skipped += 1;
        continue;
      }
      await prisma.attachment.update({
        where: { id: g.diff.id },
        data: { diffPixels: metric.diffPixels, diffPercent: metric.diffPercent },
      });
      updated += 1;
    } catch {
      skipped += 1;
    }
  }
  return { updated, skipped };
}
