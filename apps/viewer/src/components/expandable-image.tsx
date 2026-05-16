'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A thumbnail that opens the image full-screen on click. Attachment
 * screenshots render half-width in a grid — too small to read — so every
 * one needs a way out to a real zoomable view.
 */
export function ExpandableImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`${alt} — click to expand`}
        className="group relative block w-full overflow-hidden rounded border border-border bg-black/40"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block h-auto w-full" />
        <span className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 rounded border border-white/10 bg-black/55 px-1.5 py-1 text-[10px] text-white/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" />
          expand
        </span>
      </button>
      {open && <Fullscreen src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Fullscreen({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      role="dialog"
      aria-label={`${alt} (full screen)`}
    >
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5 text-fg">
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{alt}</span>
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
        <div className="flex min-h-full items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={() => setZoomed((z) => !z)}
            className={cn(
              'rounded ring-1 ring-white/10',
              zoomed
                ? 'max-w-none cursor-zoom-out'
                : 'max-h-[calc(100vh-6rem)] max-w-full cursor-zoom-in object-contain',
            )}
          />
        </div>
      </div>
      <footer className="flex items-center gap-3 border-t border-white/10 px-4 py-2 text-[11px] text-fg-subtle">
        <span>click image to {zoomed ? 'fit' : 'zoom to actual size'}</span>
        <span className="text-white/20">·</span>
        <span>Esc to close</span>
      </footer>
    </div>,
    document.body,
  );
}
