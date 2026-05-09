'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SnapshotDiff, type SnapshotTriplet } from './snapshot-diff';
import { DiffLightbox } from './diff-lightbox';

type Props = {
  triplets: SnapshotTriplet[];
};

export function DiffGallery({ triplets: initial }: Props) {
  const [triplets, setTriplets] = useState(initial);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const router = useRouter();

  const markApproved = useCallback((snapshotName: string) => {
    setTriplets((prev) =>
      prev.map((t) => (t.snapshotName === snapshotName ? { ...t, approved: true } : t)),
    );
  }, []);

  const onApprove = useCallback(
    async (t: SnapshotTriplet) => {
      if (!t.actual) return { ok: false, error: 'no actual image' };
      const res = await fetch(`/api/approve/${t.actual.id}`, { method: 'POST' });
      if (res.ok) {
        markApproved(t.snapshotName);
        router.refresh();
        return { ok: true };
      }
      const text = await res.text().catch(() => '');
      return { ok: false, error: text || `approve failed (${res.status})` };
    },
    [markApproved, router],
  );

  return (
    <>
      <div className="space-y-3">
        {triplets.map((t, i) => (
          <SnapshotDiff
            key={t.snapshotName}
            triplet={t}
            onOpen={() => setOpenIndex(i)}
            onApproved={() => markApproved(t.snapshotName)}
          />
        ))}
      </div>
      {openIndex !== null && (
        <DiffLightbox
          triplets={triplets}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onApprove={onApprove}
        />
      )}
    </>
  );
}
