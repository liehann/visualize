import path from 'node:path';
import { prisma } from '@/lib/db';

/**
 * For tests that failed with "A snapshot doesn't exist… writing actual",
 * find the candidate Baseline rows the action's `baseline-path` step
 * uploaded for those snapshots and that haven't been approved yet.
 *
 * The match is on the Baseline `name` (filename without `.png`), which
 * is what the action sets at upload time:
 *
 *     NAME=$(basename "$png" .png)
 *
 * That's stable across the absolute path the error string references and
 * the repo-relative path stored on Baseline, so it works without us
 * having to share filesystem context with the consumer.
 *
 * Filtered to the run's project + approvedAt: null. We don't filter on
 * commitSha because the action uploads the goldens dir on every run, so
 * a baseline uploaded by a later commit on the same branch is the right
 * candidate to surface — the most recent upload wins.
 */
export type PendingBaseline = {
  id: string;
  name: string;
  path: string;
  storagePath: string;
  width: number | null;
  height: number | null;
  uploadedAt: Date;
  commitSha: string | null;
};

export async function findPendingBaselinesForTest(opts: {
  projectId: string;
  errorMessages: Array<string | null | undefined>;
}): Promise<PendingBaseline[]> {
  const names = extractMissingSnapshotNames(opts.errorMessages);
  if (names.length === 0) return [];

  const rows = await prisma.baseline.findMany({
    where: {
      projectId: opts.projectId,
      approvedAt: null,
      name: { in: names },
    },
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true,
      name: true,
      path: true,
      storagePath: true,
      width: true,
      height: true,
      uploadedAt: true,
      commitSha: true,
    },
  });

  // Multiple uploads of the same snapshot (e.g. retries) collapse to the
  // most recent — older candidates are stale, the action's later upload
  // is the source of truth.
  const byName = new Map<string, PendingBaseline>();
  for (const r of rows) {
    if (!byName.has(r.name)) byName.set(r.name, r);
  }
  return Array.from(byName.values());
}

const MISSING_SNAPSHOT_RE =
  /A snapshot doesn(?:'|\\u2019)?t exist at\s+(\S+\.png)/g;

export function extractMissingSnapshotNames(
  errorMessages: Array<string | null | undefined>,
): string[] {
  const names = new Set<string>();
  for (const msg of errorMessages) {
    if (!msg) continue;
    for (const match of msg.matchAll(MISSING_SNAPSHOT_RE)) {
      const fullPath = match[1];
      if (!fullPath) continue;
      // Use the basename without `.png` extension — matches what the
      // action's baseline-path step set on Baseline.name.
      names.add(path.basename(fullPath, '.png'));
    }
  }
  return Array.from(names);
}
