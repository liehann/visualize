'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SnapshotTriplet = {
  snapshotName: string;
  actual?: { id: string; src: string };
  // `id` is optional because `expected` can be sourced from the uploaded
  // golden Baseline (which has no Playwright attachment id) when the report
  // didn't embed an expected image. `fromBaseline` lets the UI label it.
  expected?: { id?: string; src: string; fromBaseline?: boolean };
  diff?: { id: string; src: string };
  diffPercent?: number;
  diffPixels?: number;
  approved?: boolean;
  // Optional run context — set when a triplet is shown inside a run-wide
  // lightbox so the header can name the originating test and link to it.
  testId?: string;
  testTitle?: string;
  testHref?: string;
};

type Props = {
  triplet: SnapshotTriplet;
  onOpen?: () => void;
  onApproved?: () => void;
};

export function SnapshotDiff({ triplet, onOpen, onApproved }: Props) {
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
        onApproved?.();
        return;
      }
      // Prefer the structured `detail` field from the route's catch
      // block over raw text — it carries the underlying server error
      // (e.g. EROFS / ENOENT from a misconfigured volume).
      let detail: string | null = null;
      try {
        const body = (await res.clone().json()) as { detail?: string; error?: string };
        detail = body.detail ?? body.error ?? null;
      } catch {
        detail = (await res.text().catch(() => '')) || null;
      }
      setError(detail || `approve failed (${res.status})`);
    });
  };

  return (
    <div className="rounded-lg border border-border bg-bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="truncate font-mono text-sm text-fg">{triplet.snapshotName}</h3>
          {triplet.diffPercent !== undefined && (
            <DiffPercentBadge percent={triplet.diffPercent} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {onOpen && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpen}
              title="Open full compare — slider, difference, zoom & pan (or click any image)"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              compare
            </Button>
          )}
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
        <SideView triplet={triplet} onOpen={onOpen} />
      </div>
    </div>
  );
}

function DiffPercentBadge({ percent }: { percent: number }) {
  // Bucket by impact so reviewers can scan a list and immediately spot
  // the heavy hitters. Sub-1% is almost always antialiasing/pixel noise;
  // double digits is a real change.
  const tone =
    percent >= 10
      ? 'border-danger/40 bg-danger/10 text-danger'
      : percent >= 1
        ? 'border-warn/40 bg-warn/10 text-warn'
        : 'border-fg-subtle/30 bg-fg-subtle/10 text-fg-subtle';
  const display =
    percent >= 1 ? percent.toFixed(1) : percent >= 0.01 ? percent.toFixed(2) : '<0.01';
  return (
    <span
      className={cn('inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px]', tone)}
      title={`${percent.toFixed(4)}% of pixels differ`}
    >
      {display}%
    </span>
  );
}

function ImageFrame({
  label,
  note,
  src,
  variant = 'neutral',
  onOpen,
}: {
  label: string;
  note?: string;
  src?: string;
  variant?: 'neutral' | 'expected' | 'actual' | 'diff';
  onOpen?: () => void;
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
        {note && (
          <span className="rounded border border-border px-1 text-[9px] normal-case tracking-normal text-fg-subtle">
            {note}
          </span>
        )}
      </div>
      <div
        className={cn(
          'group relative overflow-hidden rounded border border-border bg-black/40',
          ring,
          src && onOpen ? 'cursor-zoom-in' : '',
        )}
        onClick={src && onOpen ? onOpen : undefined}
      >
        {src ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label} className="block h-auto w-full" />
            {onOpen && (
              <span className="pointer-events-none absolute right-1.5 top-1.5 rounded border border-white/10 bg-black/50 p-1 text-white/70 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                <Maximize2 className="h-3.5 w-3.5" />
              </span>
            )}
          </>
        ) : (
          <div className="grid h-32 place-items-center text-xs text-fg-subtle">no image</div>
        )}
      </div>
    </div>
  );
}

function SideView({
  triplet,
  onOpen,
}: {
  triplet: SnapshotTriplet;
  onOpen?: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <ImageFrame
        label="expected"
        note={triplet.expected?.fromBaseline ? 'current baseline' : undefined}
        src={triplet.expected?.src}
        variant="expected"
        onOpen={onOpen}
      />
      <ImageFrame label="actual" src={triplet.actual?.src} variant="actual" onOpen={onOpen} />
      <ImageFrame label="diff" src={triplet.diff?.src} variant="diff" onOpen={onOpen} />
    </div>
  );
}

