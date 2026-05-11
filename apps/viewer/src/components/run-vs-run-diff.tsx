'use client';

import { useState } from 'react';
import { Maximize2, ArrowRight } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type RunVsRunTriplet = {
  snapshotName: string;
  kind: 'changed' | 'added' | 'removed';
  actualA?: string;
  actualB?: string;
  diffPercent?: number;
  testTitle: string;
};

type Props = {
  triplet: RunVsRunTriplet;
  labelA: string;
  labelB: string;
  hrefA?: string;
  hrefB?: string;
};

export function RunVsRunDiff({ triplet, labelA, labelB, hrefA, hrefB }: Props) {
  const [view, setView] = useState<'side' | 'overlay'>('side');

  return (
    <div className="rounded-lg border border-border bg-bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <KindBadge kind={triplet.kind} />
          <h3 className="truncate font-mono text-sm text-fg">{triplet.snapshotName}</h3>
          {triplet.diffPercent !== undefined && (
            <DiffPercentBadge percent={triplet.diffPercent} />
          )}
        </div>
        {triplet.kind === 'changed' && triplet.actualA && triplet.actualB && (
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList className="h-7">
              <TabsTrigger className="px-2 text-[11px]" value="side">
                side
              </TabsTrigger>
              <TabsTrigger className="px-2 text-[11px]" value="overlay">
                overlay
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </header>
      <div className="border-b border-border px-4 py-1.5 text-xs text-fg-subtle">
        <a href={hrefB ?? hrefA ?? '#'} className="hover:text-fg-muted">
          {triplet.testTitle}
        </a>
      </div>
      <div className="p-4">
        {view === 'side' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ImageFrame
              label={labelA}
              src={triplet.actualA}
              variant={triplet.kind === 'removed' ? 'removed' : 'a'}
              href={hrefA}
            />
            <ImageFrame
              label={labelB}
              src={triplet.actualB}
              variant={triplet.kind === 'added' ? 'added' : 'b'}
              href={hrefB}
            />
          </div>
        ) : (
          <OverlayView a={triplet.actualA} b={triplet.actualB} />
        )}
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: 'changed' | 'added' | 'removed' }) {
  const tone =
    kind === 'changed'
      ? 'border-warn/40 bg-warn/10 text-warn'
      : kind === 'added'
        ? 'border-success/40 bg-success/10 text-success'
        : 'border-fg-subtle/30 bg-fg-subtle/10 text-fg-subtle';
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded border px-1.5 text-[10px] uppercase tracking-wider',
        tone,
      )}
    >
      {kind}
    </span>
  );
}

function DiffPercentBadge({ percent }: { percent: number }) {
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
      className={cn(
        'inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px]',
        tone,
      )}
      title={`${percent.toFixed(4)}% of pixels differ`}
    >
      {display}%
    </span>
  );
}

function ImageFrame({
  label,
  src,
  variant,
  href,
}: {
  label: string;
  src?: string;
  variant: 'a' | 'b' | 'added' | 'removed';
  href?: string;
}) {
  const ring =
    variant === 'a'
      ? 'ring-1 ring-fg-subtle/30'
      : variant === 'b'
        ? 'ring-1 ring-accent/40'
        : variant === 'added'
          ? 'ring-1 ring-success/40'
          : 'ring-1 ring-fg-subtle/40';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div
        className={cn(
          'group relative overflow-hidden rounded border border-border bg-black/40',
          ring,
        )}
      >
        {src ? (
          href ? (
            <a href={href} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={label} className="block h-auto w-full" />
              <span className="pointer-events-none absolute right-1.5 top-1.5 rounded border border-white/10 bg-black/50 p-1 text-white/70 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                <Maximize2 className="h-3.5 w-3.5" />
              </span>
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={label} className="block h-auto w-full" />
          )
        ) : (
          <div className="grid h-32 place-items-center text-xs text-fg-subtle">
            (not in this run)
          </div>
        )}
      </div>
    </div>
  );
}

function OverlayView({ a, b }: { a?: string; b?: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded border border-border bg-black/40">
      {a && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a} alt="run A" className="block h-auto w-full" />
      )}
      {b && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={b}
          alt="run B overlay"
          className="absolute inset-0 block h-full w-full mix-blend-difference"
        />
      )}
    </div>
  );
}

export { ArrowRight };
