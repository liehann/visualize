'use client';

import { useState } from 'react';
import { Activity, ExternalLink, Loader2 } from 'lucide-react';

type Props = {
  attachmentId: string;
};

/**
 * Open a trace.zip in https://trace.playwright.dev — Playwright's
 * official trace viewer hosted by them. We mint a 5-minute HMAC-signed
 * URL on `/api/trace/raw/<id>` (auth-bypassed via middleware) so the
 * cross-origin fetch from trace.playwright.dev can read the bytes
 * without needing our session cookie.
 *
 * Falls back to showing the error in-place if signing fails (e.g.
 * VIEWER_URL not configured).
 */
export function TraceViewerButton({ attachmentId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onOpen = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trace/sign/${attachmentId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { detail?: string; error?: string }
          | null;
        throw new Error(
          body?.detail ?? body?.error ?? `sign failed (${res.status})`,
        );
      }
      const body = (await res.json()) as { playwrightTraceUrl: string };
      // Open in a new tab so the trace viewer doesn't replace the
      // current run page.
      window.open(body.playwrightTraceUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onOpen}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-bg-panel px-3 py-1 text-xs text-fg hover:bg-bg-hover disabled:opacity-60"
        title="Opens the Playwright trace viewer in a new tab"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Activity className="h-3.5 w-3.5" />
        )}
        View trace
        <ExternalLink className="h-3 w-3 opacity-70" />
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
