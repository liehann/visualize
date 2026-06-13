'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SnapshotTriplet } from './snapshot-diff';

export type LightboxView = 'side' | 'slider' | 'difference' | 'diff';

type Props = {
  triplets: SnapshotTriplet[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  onApprove: (triplet: SnapshotTriplet) => Promise<{ ok: boolean; error?: string }>;
};

export function DiffLightbox({
  triplets,
  index,
  onIndexChange,
  onClose,
  onApprove,
}: Props) {
  const triplet = triplets[index];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(triplet?.approved ?? false);

  // The view mode is remembered across diffs and across sessions (default:
  // split/side). `preferredView` is what the user last picked; the effective
  // `view` honors it whenever the current triplet can show it, otherwise it
  // gracefully falls back without forgetting the preference.
  const [preferredView, setPreferredView] = useState<LightboxView>(
    () => readStoredView() ?? 'side',
  );
  const has = availableViews(triplet);
  const view = has[preferredView] ? preferredView : fallbackView(triplet);

  const approvedCount = triplets.reduce((n, t) => n + (t.approved ? 1 : 0), 0);

  const hasRef = useRef(has);
  hasRef.current = has;
  const chooseView = useCallback((v: LightboxView) => {
    if (!hasRef.current[v]) return; // ignore unavailable modes (e.g. no expected)
    setPreferredView(v);
    writeStoredView(v);
  }, []);

  useEffect(() => {
    setApproved(triplet?.approved ?? false);
    setError(null);
  }, [index, triplet]);

  const goPrev = useCallback(() => {
    if (triplets.length <= 1) return;
    onIndexChange((index - 1 + triplets.length) % triplets.length);
  }, [index, triplets.length, onIndexChange]);

  const goNext = useCallback(() => {
    if (triplets.length <= 1) return;
    onIndexChange((index + 1) % triplets.length);
  }, [index, triplets.length, onIndexChange]);

  const handleApprove = useCallback(async () => {
    if (!triplet || approved || pending) return;
    setPending(true);
    setError(null);
    const res = await onApprove(triplet);
    setPending(false);
    if (res.ok) setApproved(true);
    else setError(res.error ?? 'approve failed');
  }, [triplet, approved, pending, onApprove]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        void handleApprove();
      } else if (e.key === '1') {
        chooseView('side');
      } else if (e.key === '2') {
        chooseView('slider');
      } else if (e.key === '3') {
        chooseView('difference');
      } else if (e.key === '4') {
        chooseView('diff');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, onClose, handleApprove, chooseView]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!triplet) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      role="dialog"
      aria-label="Snapshot diff"
    >
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5 text-fg">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm">{triplet.snapshotName}</span>
            {triplet.diffPercent !== undefined && (
              <LightboxDiffBadge percent={triplet.diffPercent} />
            )}
          </div>
          {(triplet.testTitle || triplets.length > 1) && (
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-subtle">
              {triplet.testTitle &&
                (triplet.testHref ? (
                  <Link
                    href={triplet.testHref}
                    className="truncate underline-offset-2 hover:text-fg-muted hover:underline"
                    title="Open this test"
                  >
                    {triplet.testTitle}
                  </Link>
                ) : (
                  <span className="truncate">{triplet.testTitle}</span>
                ))}
              {triplets.length > 1 && (
                <span className="shrink-0">
                  {index + 1} of {triplets.length}
                </span>
              )}
              {triplets.length > 1 && approvedCount > 0 && (
                <span className="shrink-0 text-success">
                  · {approvedCount}/{triplets.length} approved
                </span>
              )}
            </div>
          )}
        </div>
        <ViewSwitcher view={view} onChange={chooseView} triplet={triplet} />
        {approved ? (
          <Button variant="success" size="sm" disabled>
            <Check className="h-3.5 w-3.5" />
            approved
          </Button>
        ) : (
          <Button
            variant="success"
            size="sm"
            onClick={handleApprove}
            disabled={pending || !triplet.actual}
            title="Promote actual → baseline (A)"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            approve
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          title="Close (Esc)"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {error && (
        <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        {triplets.length > 1 && (
          <>
            <button
              onClick={goPrev}
              aria-label="Previous diff (←)"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2 text-white/80 backdrop-blur hover:bg-black/60 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goNext}
              aria-label="Next diff (→)"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2 text-white/80 backdrop-blur hover:bg-black/60 hover:text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        <Stage view={view} triplet={triplet} />
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2 text-[11px] text-fg-subtle">
        <div className="flex items-center gap-3">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <span>navigate</span>
          <span className="text-white/20">·</span>
          <Kbd>A</Kbd>
          <span>approve</span>
          <span className="text-white/20">·</span>
          <Kbd>1</Kbd>
          <span>side</span>
          <Kbd>2</Kbd>
          <span>slider</span>
          <Kbd>3</Kbd>
          <span>difference</span>
          <Kbd>4</Kbd>
          <span>diff</span>
          <span className="text-white/20">·</span>
          <Kbd>Esc</Kbd>
          <span>close</span>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <span>scroll to zoom · drag to pan · double-click to reset</span>
        </div>
      </footer>
    </div>,
    document.body,
  );
}

function LightboxDiffBadge({ percent }: { percent: number }) {
  const tone =
    percent >= 10
      ? 'border-danger/40 bg-danger/15 text-danger'
      : percent >= 1
        ? 'border-warn/40 bg-warn/15 text-warn'
        : 'border-white/15 bg-white/5 text-fg-subtle';
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

const VIEW_STORAGE_KEY = 'visualize:lightbox-view';
const ALL_VIEWS: LightboxView[] = ['side', 'slider', 'difference', 'diff'];

function readStoredView(): LightboxView | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return v && (ALL_VIEWS as string[]).includes(v) ? (v as LightboxView) : null;
  } catch {
    return null;
  }
}

function writeStoredView(v: LightboxView) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  } catch {
    // private mode / storage disabled — remembering is best-effort.
  }
}

function availableViews(
  triplet: SnapshotTriplet | undefined,
): Record<LightboxView, boolean> {
  return {
    side: !!(triplet?.expected || triplet?.actual || triplet?.diff),
    slider: !!(triplet?.expected && triplet?.actual),
    difference: !!(triplet?.expected && triplet?.actual),
    diff: !!triplet?.diff,
  };
}

// Split (side) is the canonical default; for triplets that can't show the
// remembered mode, fall back to the first mode they support.
function fallbackView(triplet: SnapshotTriplet | undefined): LightboxView {
  const has = availableViews(triplet);
  return ALL_VIEWS.find((v) => has[v]) ?? 'side';
}

function ViewSwitcher({
  view,
  onChange,
  triplet,
}: {
  view: LightboxView;
  onChange: (v: LightboxView) => void;
  triplet: SnapshotTriplet;
}) {
  const has = availableViews(triplet);
  const items: { v: LightboxView; label: string; key: string; title: string }[] = [
    { v: 'side', label: 'side', key: '1', title: 'Expected, actual and diff side by side' },
    {
      v: 'slider',
      label: 'slider',
      key: '2',
      title: 'Drag the handle to wipe between expected and actual',
    },
    {
      v: 'difference',
      label: 'difference',
      key: '3',
      title: 'Expected and actual blended: matching pixels go black, changes glow',
    },
    { v: 'diff', label: 'diff', key: '4', title: "Playwright's computed diff image" },
  ];
  return (
    <div className="flex items-center rounded-md border border-white/10 bg-white/5 p-0.5 text-[11px]">
      {items.map((it) => (
        <button
          key={it.v}
          onClick={() => onChange(it.v)}
          disabled={!has[it.v]}
          title={`${it.title} · key ${it.key}`}
          className={cn(
            'rounded px-2 py-1 transition-colors',
            view === it.v
              ? 'bg-white/15 text-white'
              : 'text-fg-subtle hover:text-fg disabled:opacity-30 disabled:hover:text-fg-subtle',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-white/15 bg-white/5 px-1 font-mono text-[10px] text-fg-muted">
      {children}
    </span>
  );
}

function Stage({ view, triplet }: { view: LightboxView; triplet: SnapshotTriplet }) {
  if (view === 'side') return <SideStage triplet={triplet} />;
  if (view === 'slider') return <SliderStage triplet={triplet} />;
  if (view === 'difference') return <DifferenceStage triplet={triplet} />;
  return <DiffStage triplet={triplet} />;
}

function SideStage({ triplet }: { triplet: SnapshotTriplet }) {
  const cells = [
    {
      label: triplet.expected?.fromBaseline ? 'expected · current baseline' : 'expected',
      src: triplet.expected?.src,
      ring: 'ring-fg-subtle/40',
    },
    { label: 'actual', src: triplet.actual?.src, ring: 'ring-accent/50' },
    { label: 'diff', src: triplet.diff?.src, ring: 'ring-danger/50' },
  ].filter((c) => c.src);
  const cols = cells.length === 1 ? 'grid-cols-1' : cells.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className={cn('grid h-full gap-2 p-3', cols)}>
      {cells.map((c) => (
        <div key={c.label} className="flex min-h-0 flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
            {c.label}
          </div>
          <div
            className={cn(
              'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded ring-1',
              c.ring,
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.src!}
              alt={c.label}
              draggable={false}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffStage({ triplet }: { triplet: SnapshotTriplet }) {
  if (!triplet.diff) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
        no diff image
      </div>
    );
  }
  return (
    <div className="h-full p-3">
      <div className="relative h-full overflow-hidden rounded ring-1 ring-danger/50">
        <ZoomPan src={triplet.diff.src} alt="diff" />
      </div>
    </div>
  );
}

function DifferenceStage({ triplet }: { triplet: SnapshotTriplet }) {
  if (!triplet.expected || !triplet.actual) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
        need both expected and actual
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="shrink-0 rounded border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-fg-subtle">
        Expected and actual blended together —{' '}
        <span className="text-fg-muted">identical pixels turn black</span>; anything
        that <span className="text-fg-muted">glows</span> is what changed.
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded ring-1 ring-accent/40">
        <ZoomPan
          src={triplet.expected.src}
          alt="expected"
          overlaySrc={triplet.actual.src}
          overlayMode="difference"
        />
      </div>
    </div>
  );
}

function SliderStage({ triplet }: { triplet: SnapshotTriplet }) {
  const [pos, setPos] = useState(0.5);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  const updateFromClientX = (clientX: number) => {
    const el = surfaceRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setPos(next);
  };

  if (!triplet.expected || !triplet.actual) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
        need both expected and actual
      </div>
    );
  }

  return (
    <div className="h-full p-3">
      <div
        ref={surfaceRef}
        onPointerDown={(e) => {
          dragRef.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          updateFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          updateFromClientX(e.clientX);
        }}
        onPointerUp={(e) => {
          dragRef.current = false;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = false;
        }}
        className="relative h-full select-none overflow-hidden rounded ring-1 ring-accent/40"
        style={{ cursor: 'ew-resize', touchAction: 'none' }}
      >
        <SliderImage src={triplet.expected.src} label="expected" align="left" />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 0 0 ${pos * 100}%)` }}
        >
          <SliderImage src={triplet.actual.src} label="actual" align="right" />
        </div>
        <div
          className="pointer-events-none absolute top-0 bottom-0 flex w-px items-center justify-center bg-white"
          style={{ left: `${pos * 100}%` }}
        >
          <div className="pointer-events-auto -ml-3 flex h-8 w-6 items-center justify-center rounded-sm bg-white text-black shadow-lg">
            <span className="text-[10px] font-bold">⇔</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SliderImage({
  src,
  label,
  align,
}: {
  src: string;
  label: string;
  align: 'left' | 'right';
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
      />
      <div
        className={cn(
          'absolute top-2 z-10 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/80 backdrop-blur',
          align === 'left' ? 'left-2' : 'right-2',
        )}
      >
        {label}
      </div>
    </>
  );
}

function ZoomPan({
  src,
  alt,
  overlaySrc,
  overlayMode,
}: {
  src: string;
  alt: string;
  overlaySrc?: string;
  overlayMode?: 'difference';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nextScale = Math.max(0.2, Math.min(20, scale * factor));
    const ratio = nextScale / scale;
    setScale(nextScale);
    setTx((cx - (cx - tx) * ratio));
    setTy((cy - (cy - ty) * ratio));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: e.clientX - tx, y: e.clientY - ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setTx(e.clientX - dragRef.current.x);
    setTy(e.clientY - dragRef.current.y);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={reset}
      className="absolute inset-0 select-none overflow-hidden"
      style={{
        cursor: dragRef.current ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      <div
        className="absolute inset-0 origin-center"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
        />
        {overlaySrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={overlaySrc}
            alt={`${alt} overlay`}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              mixBlendMode: overlayMode ?? 'normal',
            }}
          />
        )}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white/70 backdrop-blur">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}

export function LightboxTrigger({
  onClick,
  className,
  title,
}: {
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? 'Open in lightbox'}
      className={cn(
        'absolute right-1.5 top-1.5 z-10 rounded border border-white/10 bg-black/50 p-1 text-white/70 opacity-0 backdrop-blur transition-opacity hover:text-white group-hover:opacity-100',
        className,
      )}
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
  );
}

export type { SnapshotTriplet };
