import type { SnapshotTriplet } from '@/components/snapshot-diff';
import { attachmentSrc } from '@/lib/attachment-url';

type BaselineLike = { name: string; storagePath: string };

/**
 * Playwright only embeds the `-expected.png` half of a snapshot triplet on
 * failure, and even then its `path` frequently points at the repo's
 * committed snapshot dir — which is not in the uploaded bundle — so the
 * parser drops it. The uploaded golden Baseline is the real source of
 * truth for "before", so backfill any triplet missing `expected` from it
 * (keyed by snapshot name). A report-embedded expected always wins.
 */
export function fillExpectedFromBaselines(
  triplets: SnapshotTriplet[],
  baselines: BaselineLike[],
): SnapshotTriplet[] {
  const byName = new Map(baselines.map((b) => [b.name, b]));
  return triplets.map((t) => {
    if (t.expected) return t;
    const b = byName.get(t.snapshotName);
    if (!b) return t;
    return {
      ...t,
      expected: { src: attachmentSrc(b.storagePath), fromBaseline: true },
    };
  });
}
