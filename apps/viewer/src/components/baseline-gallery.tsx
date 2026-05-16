'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BaselineItem = {
  id: string;
  name: string;
  src: string;
  browser: string;
  platform: string;
};

/**
 * The golden Baseline *is* the current passing screenshot — Playwright
 * emits no attachments when a snapshot test passes, so this is the only
 * place to actually see what a green screen looks like. Browsable grid +
 * a keyboard-steppable full-screen viewer (no approve: these are already
 * the source of truth).
 */
export function BaselineGallery({ baselines }: { baselines: BaselineItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  if (baselines.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-bg-panel/60 px-4 py-8 text-center text-sm text-fg-subtle">
        No baselines yet. CI pushes goldens alongside the Playwright report;
        once a snapshot is approved it shows here as the current screenshot.
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {baselines.map((b, i) => (
          <li key={b.id}>
            <button
              onClick={() => setOpen(i)}
              className="group block w-full overflow-hidden rounded-lg border border-border bg-bg-panel text-left transition-colors hover:border-border-strong"
              title={`${b.name} — open`}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.src}
                  alt={b.name}
                  loading="lazy"
                  className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
                />
              </div>
              <div className="space-y-1 px-3 py-2">
                <div className="truncate font-mono text-xs text-fg" title={b.name}>
                  {b.name}
                </div>
                <BrowserPlatform browser={b.browser} platform={b.platform} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <BaselineViewer
          baselines={baselines}
          index={open}
          onIndexChange={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function BrowserPlatform({
  browser,
  platform,
}: {
  browser: string;
  platform: string;
}) {
  const chips = [browser, platform].filter((v) => v && v !== 'any');
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c}
          className="rounded border border-border px-1 text-[10px] text-fg-subtle"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function BaselineViewer({
  baselines,
  index,
  onIndexChange,
  onClose,
}: {
  baselines: BaselineItem[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const item = baselines[index];

  const goPrev = useCallback(() => {
    if (baselines.length <= 1) return;
    onIndexChange((index - 1 + baselines.length) % baselines.length);
  }, [index, baselines.length, onIndexChange]);

  const goNext = useCallback(() => {
    if (baselines.length <= 1) return;
    onIndexChange((index + 1) % baselines.length);
  }, [index, baselines.length, onIndexChange]);

  useEffect(() => {
    setZoomed(false);
  }, [index]);

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!item) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      role="dialog"
      aria-label="Baseline screenshot"
    >
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5 text-fg">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm">{item.name}</div>
          {baselines.length > 1 && (
            <div className="mt-0.5 text-[11px] text-fg-subtle">
              {index + 1} of {baselines.length}
            </div>
          )}
        </div>
        <BrowserPlatform browser={item.browser} platform={item.platform} />
        <button
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
          className="rounded p-1.5 text-fg-subtle hover:bg-bg-hover hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="relative flex-1 overflow-auto">
        {baselines.length > 1 && (
          <>
            <button
              onClick={goPrev}
              aria-label="Previous baseline (←)"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2 text-white/80 backdrop-blur hover:bg-black/60 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goNext}
              aria-label="Next baseline (→)"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2 text-white/80 backdrop-blur hover:bg-black/60 hover:text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        <div className="flex min-h-full items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.src}
            alt={item.name}
            onClick={() => setZoomed((z) => !z)}
            className={cn(
              'rounded ring-1 ring-white/10',
              zoomed
                ? 'max-w-none cursor-zoom-out'
                : 'max-h-[calc(100vh-7rem)] max-w-full cursor-zoom-in object-contain',
            )}
          />
        </div>
      </div>

      <footer className="flex items-center gap-3 border-t border-white/10 px-4 py-2 text-[11px] text-fg-subtle">
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
        <span>navigate</span>
        <span className="text-white/20">·</span>
        <span>click image to {zoomed ? 'fit' : 'zoom'}</span>
        <span className="text-white/20">·</span>
        <Kbd>Esc</Kbd>
        <span>close</span>
      </footer>
    </div>,
    document.body,
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-white/15 bg-white/5 px-1 font-mono text-[10px] text-fg-muted">
      {children}
    </span>
  );
}
