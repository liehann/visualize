'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type PendingBaselineCardProps = {
  baselineId: string;
  name: string;
  path: string;
  src: string;
  width: number | null;
  height: number | null;
};

/**
 * Render a single pending Baseline that corresponds to a "writing actual"
 * failure on the current test. One-click approve flips the gate so the
 * next CI run lands the new snapshot.
 */
export function PendingBaselineCard({
  baselineId,
  name,
  path,
  src,
  width,
  height,
}: PendingBaselineCardProps) {
  const router = useRouter();
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onApprove = () => {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/baselines/${baselineId}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        setApproved(true);
        router.refresh();
        return;
      }
      // Try to surface the server's `detail` if the response is JSON;
      // fall back to plain text + status. Useful when the route is
      // returning 500 — the new instrumented route includes the error
      // message in the body.
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
    <article className="overflow-hidden rounded-lg border border-warn/30 bg-bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-warn/30 bg-warn/5 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-warn" />
          <h3 className="truncate font-mono text-sm text-fg">{name}</h3>
        </div>
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
            disabled={pending}
            title="Mark this baseline as approved — next CI run will land it"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            approve baseline
          </Button>
        )}
      </header>
      {error && (
        <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div className="bg-bg-hover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          className="block max-h-[480px] w-full object-contain"
        />
      </div>
      <div className="space-y-1 px-4 py-3 text-[11px] text-fg-subtle">
        <p className="break-all font-mono">{path}</p>
        {width && height && (
          <p className="font-mono">
            {width} × {height}px
          </p>
        )}
      </div>
    </article>
  );
}
