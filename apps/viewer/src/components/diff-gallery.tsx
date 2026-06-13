'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SnapshotDiff, type SnapshotTriplet } from './snapshot-diff';
import { DiffLightbox } from './diff-lightbox';

type Props = {
  // This test's diffs — rendered as the inline cards.
  triplets: SnapshotTriplet[];
  // Optional run-wide diff list. When provided, opening a card steps the
  // lightbox across every diff in the run (← →), not just this test's.
  navTriplets?: SnapshotTriplet[];
};

export function DiffGallery({ triplets: initialCards, navTriplets }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [nav, setNav] = useState(navTriplets ?? initialCards);
  // `mode` picks which list the lightbox steps through: the run-wide `nav`
  // list when the opened card belongs to it, else just this card on its own.
  const [opened, setOpened] = useState<{ mode: 'nav' | 'cards'; index: number } | null>(
    null,
  );
  const router = useRouter();

  const markApprovedById = useCallback((actualId: string) => {
    const mark = (t: SnapshotTriplet) =>
      t.actual?.id === actualId ? { ...t, approved: true } : t;
    setCards((prev) => prev.map(mark));
    setNav((prev) => prev.map(mark));
  }, []);

  const onApprove = useCallback(
    async (t: SnapshotTriplet) => {
      if (!t.actual) return { ok: false, error: 'no actual image' };
      const id = t.actual.id;
      const res = await fetch(`/api/approve/${id}`, { method: 'POST' });
      if (res.ok) {
        markApprovedById(id);
        router.refresh();
        return { ok: true };
      }
      const text = await res.text().catch(() => '');
      return { ok: false, error: text || `approve failed (${res.status})` };
    },
    [markApprovedById, router],
  );

  const openCard = useCallback(
    (card: SnapshotTriplet, fallbackIndex: number) => {
      const id = card.actual?.id;
      const navIndex = id
        ? nav.findIndex((t) => t.actual?.id === id)
        : -1;
      if (navIndex >= 0) setOpened({ mode: 'nav', index: navIndex });
      else setOpened({ mode: 'cards', index: fallbackIndex });
    },
    [nav],
  );

  const activeList = opened?.mode === 'cards' ? cards : nav;

  return (
    <>
      <div className="space-y-3">
        {cards.map((t, i) => (
          <SnapshotDiff
            key={t.snapshotName}
            triplet={t}
            onOpen={() => openCard(t, i)}
            onApproved={() => t.actual && markApprovedById(t.actual.id)}
          />
        ))}
      </div>
      {opened !== null && (
        <DiffLightbox
          triplets={activeList}
          index={opened.index}
          onIndexChange={(i) => setOpened((o) => (o ? { ...o, index: i } : o))}
          onClose={() => setOpened(null)}
          onApprove={onApprove}
        />
      )}
    </>
  );
}
