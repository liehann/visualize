'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type SnapshotTriplet = {
  snapshotName: string;
  actual?: { id: string; src: string };
  expected?: { id: string; src: string };
  diff?: { id: string; src: string };
  // Whether the actual has already been promoted to baseline.
  approved?: boolean;
};

type Props = {
  triplet: SnapshotTriplet;
};

/**
 * Side-by-side actual / expected / diff with one-click approve.
 *
 * The approve button is *per-screenshot*. Clicking it promotes the actual
 * image to the new baseline for this snapshot's (project, name, browser,
 * platform) tuple.
 */
export function SnapshotDiff({ triplet }: Props) {
  const [view, setView] = useState<'side' | 'overlay' | 'diff'>('side');
  const [approved, setApproved] = useState(triplet.approved ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onApprove = () => {
    if (!triplet.actual) return;
    setError(null);
    const id = triplet.actual.id;
    start(async () => {
      const res = await fetch(`/api/approve/${id}`, { method: 'POST' });
      if (res.ok) {
        setApproved(true);
      } else {
        const text = await res.text().catch(() => '');
        setError(text || `approve failed (${res.status})`);
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="truncate font-mono text-sm text-fg">{triplet.snapshotName}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList className="h-7">
              <TabsTrigger className="px-2 text-[11px]" value="side">side</TabsTrigger>
              <TabsTrigger className="px-2 text-[11px]" value="overlay">overlay</TabsTrigger>
              <TabsTrigger className="px-2 text-[11px]" value="diff">diff</TabsTrigger>
            </TabsList>
          </Tabs>
          {approved ? (
            <Button variant="success" size="sm" disabled>
              <Check className="h-3.5 w-3.5" />
              approved
            </Button>
          ) : (
            <Button
              variant="success"
              size="sm"
              onClick={onApprove}
              disabled={pending || !triplet.actual}
              title="Promote the new screenshot to baseline"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              approve
            </Button>
          )}
        </div>
      </header>
      {error && (
        <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div className="p-4">
        {view === 'side' && <SideView triplet={triplet} />}
        {view === 'overlay' && <OverlayView triplet={triplet} />}
        {view === 'diff' && <DiffView triplet={triplet} />}
      </div>
    </div>
  );
}

function ImageFrame({
  label,
  src,
  variant = 'neutral',
}: {
  label: string;
  src?: string;
  variant?: 'neutral' | 'expected' | 'actual' | 'diff';
}) {
  const ring =
    variant === 'expected'
      ? 'ring-1 ring-fg-subtle/30'
      : variant === 'actual'
        ? 'ring-1 ring-accent/40'
        : variant === 'diff'
          ? 'ring-1 ring-danger/40'
          : '';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div className={cn('overflow-hidden rounded border border-border bg-black/40', ring)}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="block h-auto w-full" />
        ) : (
          <div className="grid h-32 place-items-center text-xs text-fg-subtle">
            no image
          </div>
        )}
      </div>
    </div>
  );
}

function SideView({ triplet }: { triplet: SnapshotTriplet }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <ImageFrame label="expected" src={triplet.expected?.src} variant="expected" />
      <ImageFrame label="actual" src={triplet.actual?.src} variant="actual" />
      <ImageFrame label="diff" src={triplet.diff?.src} variant="diff" />
    </div>
  );
}

function OverlayView({ triplet }: { triplet: SnapshotTriplet }) {
  return (
    <div className="relative w-full overflow-hidden rounded border border-border bg-black/40">
      {triplet.expected?.src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={triplet.expected.src} alt="expected" className="block h-auto w-full" />
      )}
      {triplet.actual?.src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={triplet.actual.src}
          alt="actual overlay"
          className="absolute inset-0 block h-full w-full mix-blend-difference"
        />
      )}
    </div>
  );
}

function DiffView({ triplet }: { triplet: SnapshotTriplet }) {
  return <ImageFrame label="diff" src={triplet.diff?.src} variant="diff" />;
}
