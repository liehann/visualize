'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X, AlertTriangle, PlaySquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DiffLightbox } from '@/components/diff-lightbox';
import type { SnapshotTriplet } from '@/components/snapshot-diff';

function BulkDiffBadge({ percent }: { percent: number }) {
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
        'inline-flex h-4 shrink-0 items-center rounded border px-1 font-mono text-[10px]',
        tone,
      )}
      title={`${percent.toFixed(4)}% of pixels differ`}
    >
      {display}%
    </span>
  );
}

export type PendingDiff = {
  attachmentId: string;
  snapshotName: string;
  testTitle: string;
  testId: string;
  actualSrc: string;
  expectedSrc?: string;
  diffSrc?: string;
  diffPercent?: number;
};

type Props = {
  runId: string;
  pending: PendingDiff[];
};

export function BulkApprove({ runId, pending }: Props) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<
    | { ok: number; failed: { name: string; error: string }[] }
    | null
  >(null);
  const [pendingFetch, start] = useTransition();
  const router = useRouter();

  // Run-wide step-through review: every pending diff across every test in
  // one keyboard-driven lightbox. ← → walks across tests, A approves and
  // auto-advances. This is the fast triage loop.
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const touchedRef = useRef(false);

  const reviewTriplets = useMemo<SnapshotTriplet[]>(
    () =>
      pending.map((p) => ({
        snapshotName: `${p.testTitle} — ${p.snapshotName}`,
        actual: { id: p.attachmentId, src: p.actualSrc },
        expected: p.expectedSrc
          ? { src: p.expectedSrc, fromBaseline: true }
          : undefined,
        diff: p.diffSrc
          ? { id: `${p.attachmentId}-diff`, src: p.diffSrc }
          : undefined,
        diffPercent: p.diffPercent,
        approved: approvedIds.has(p.attachmentId),
      })),
    [pending, approvedIds],
  );

  const closeReview = useCallback(() => {
    setReviewIndex(null);
    if (touchedRef.current) {
      touchedRef.current = false;
      router.refresh();
    }
  }, [router]);

  const onReviewApprove = useCallback(
    async (t: SnapshotTriplet) => {
      const id = t.actual?.id;
      if (!id) return { ok: false, error: 'no actual image' };
      const res = await fetch(`/api/approve/${id}`, { method: 'POST' });
      if (!res.ok) {
        let detail: string | null = null;
        try {
          const body = (await res.clone().json()) as {
            detail?: string;
            error?: string;
          };
          detail = body.detail ?? body.error ?? null;
        } catch {
          detail = (await res.text().catch(() => '')) || null;
        }
        return { ok: false, error: detail || `approve failed (${res.status})` };
      }
      touchedRef.current = true;
      setApprovedIds((prev) => new Set(prev).add(id));
      // Let the green "approved" land, then advance to the next change so a
      // sweep is just: look, A, look, A. End of list closes + refreshes.
      setTimeout(() => {
        setReviewIndex((cur) => {
          if (cur === null) return cur;
          const next = cur + 1;
          if (next < pending.length) return next;
          touchedRef.current = false;
          router.refresh();
          return null;
        });
      }, 250);
      return { ok: true };
    },
    [pending.length, router],
  );

  if (pending.length === 0) return null;

  const onConfirm = () => {
    setResults(null);
    start(async () => {
      const res = await fetch(`/api/approve/run/${runId}`, { method: 'POST' });
      if (!res.ok) {
        setResults({
          ok: 0,
          failed: [{ name: '(request)', error: `bulk approve failed (${res.status})` }],
        });
        return;
      }
      const body = (await res.json()) as {
        approved: number;
        results: { snapshotName: string; ok: boolean; error?: string }[];
      };
      const failed = body.results
        .filter((r) => !r.ok)
        .map((r) => ({ name: r.snapshotName, error: r.error ?? 'unknown' }));
      setResults({ ok: body.approved, failed });
      router.refresh();
      if (failed.length === 0) {
        setTimeout(() => setOpen(false), 800);
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-fg">
            <AlertTriangle className="h-4 w-4 text-warn" />
            {pending.length} visual change{pending.length === 1 ? '' : 's'} pending review
          </div>
          <div className="mt-0.5 text-xs text-fg-subtle">
            Step through every change across the run with the keyboard, or
            approve them all in one shot.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setApprovedIds(new Set());
              touchedRef.current = false;
              setReviewIndex(0);
            }}
            title="Open the run-wide review lightbox (← → to step, A to approve)"
          >
            <PlaySquare className="h-3.5 w-3.5" />
            review {pending.length}
          </Button>
          <Button variant="success" size="sm" onClick={() => setOpen(true)}>
            <Check className="h-3.5 w-3.5" />
            approve all
          </Button>
        </div>
      </div>

      {reviewIndex !== null && (
        <DiffLightbox
          triplets={reviewTriplets}
          index={reviewIndex}
          onIndexChange={setReviewIndex}
          onClose={closeReview}
          onApprove={onReviewApprove}
        />
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
          onClick={() => !pendingFetch && setOpen(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h2 className="text-base font-semibold text-fg">
                  Approve {pending.length} visual change{pending.length === 1 ? '' : 's'}
                </h2>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  Each &ldquo;actual&rdquo; image becomes the new baseline. The next CI run
                  diffs against these.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                disabled={pendingFetch}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </header>

            <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {pending.map((p) => {
                const failure = results?.failed.find((f) => f.name === p.snapshotName);
                const succeeded =
                  results !== null &&
                  !results.failed.some((f) => f.name === p.snapshotName);
                return (
                  <li
                    key={p.attachmentId}
                    className="flex items-start gap-3 px-5 py-3 text-xs"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.actualSrc}
                      alt={p.snapshotName}
                      className="h-14 w-20 shrink-0 rounded border border-border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[12px] text-fg">
                          {p.snapshotName}
                        </span>
                        {p.diffPercent !== undefined && (
                          <BulkDiffBadge percent={p.diffPercent} />
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-fg-subtle">
                        {p.testTitle}
                      </div>
                      {failure && (
                        <div className="mt-1 truncate text-danger">{failure.error}</div>
                      )}
                    </div>
                    {results === null ? (
                      <span className="text-fg-subtle">pending</span>
                    ) : failure ? (
                      <span className="font-medium text-danger">failed</span>
                    ) : succeeded ? (
                      <span className="inline-flex items-center gap-1 font-medium text-success">
                        <Check className="h-3 w-3" /> approved
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <footer className="flex items-center justify-between gap-3 border-t border-border bg-bg-hover/40 px-5 py-3">
              <div className="text-xs text-fg-subtle">
                {results
                  ? `${results.ok} approved · ${results.failed.length} failed`
                  : `${pending.length} ready`}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={pendingFetch}
                >
                  cancel
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  onClick={onConfirm}
                  disabled={pendingFetch}
                >
                  {pendingFetch ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  approve all
                </Button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
