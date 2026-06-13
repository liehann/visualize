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

type Props = {
  runId: string;
  // Every changed visual snapshot across the run, carrying its `approved`
  // flag, test title and deep-link. Pending = not yet approved.
  triplets: SnapshotTriplet[];
};

export function BulkApprove({ runId, triplets }: Props) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<
    | { ok: number; failed: { name: string; error: string }[] }
    | null
  >(null);
  const [pendingFetch, start] = useTransition();
  const router = useRouter();

  // Run-wide step-through review: every diff across every test in one
  // keyboard-driven lightbox. ← → walks across tests, A approves and
  // auto-advances. Available even when nothing is pending, so you can always
  // re-examine what changed.
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const approvedIdsRef = useRef(approvedIds);
  approvedIdsRef.current = approvedIds;
  const touchedRef = useRef(false);

  // Merge server `approved` with what's been approved live in this session.
  const reviewTriplets = useMemo<SnapshotTriplet[]>(
    () =>
      triplets.map((t) => ({
        ...t,
        approved: t.approved || (t.actual ? approvedIds.has(t.actual.id) : false),
      })),
    [triplets, approvedIds],
  );

  const pendingTriplets = useMemo(
    () => reviewTriplets.filter((t) => !t.approved && t.actual),
    [reviewTriplets],
  );
  const pendingCount = pendingTriplets.length;

  const startReview = useCallback(() => {
    setApprovedIds(new Set());
    touchedRef.current = false;
    const firstPending = reviewTriplets.findIndex((t) => !t.approved && t.actual);
    setReviewIndex(firstPending >= 0 ? firstPending : 0);
  }, [reviewTriplets]);

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
      const nextApproved = new Set(approvedIdsRef.current).add(id);
      approvedIdsRef.current = nextApproved;
      setApprovedIds(nextApproved);
      // Let the green "approved" land, then jump to the next change still
      // needing review, so a sweep is just: look, A, look, A. When nothing
      // is left, close + refresh — that's the "done" signal.
      const stillPending = (tt: SnapshotTriplet | undefined) =>
        !!tt?.actual && !tt.approved && !nextApproved.has(tt.actual.id);
      setTimeout(() => {
        setReviewIndex((cur) => {
          if (cur === null) return cur;
          for (let i = cur + 1; i < triplets.length; i++) {
            if (stillPending(triplets[i])) return i;
          }
          for (let i = 0; i < cur; i++) {
            if (stillPending(triplets[i])) return i;
          }
          touchedRef.current = false;
          router.refresh();
          return null;
        });
      }, 250);
      return { ok: true };
    },
    [triplets, router],
  );

  if (triplets.length === 0) return null;

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
      {pendingCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              <AlertTriangle className="h-4 w-4 text-warn" />
              {pendingCount} golden{pendingCount === 1 ? '' : 's'} need{pendingCount === 1 ? 's' : ''} review
            </div>
            <div className="mt-0.5 text-xs text-fg-subtle">
              Step through each one full-screen — <Kbd>←</Kbd> <Kbd>→</Kbd> to move,{' '}
              <Kbd>A</Kbd> to approve and jump to the next. No going back and forth.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="default"
              size="md"
              onClick={startReview}
              title="Step through every pending golden (← → to move, A to approve)"
              className="font-medium"
            >
              <PlaySquare className="h-4 w-4" />
              Review {pendingCount} golden{pendingCount === 1 ? '' : 's'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(true)}
              title="Approve all pending goldens at once, without reviewing"
            >
              approve all
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-panel px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-fg">
              <Check className="h-4 w-4 text-success" />
              {triplets.length} visual change{triplets.length === 1 ? '' : 's'} — all approved
            </div>
            <div className="mt-0.5 text-xs text-fg-subtle">
              Step back through every diff in this run any time.
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={startReview}
            title="Re-open the run-wide review lightbox (← → to step)"
            className="shrink-0"
          >
            <PlaySquare className="h-3.5 w-3.5" />
            review {triplets.length} golden{triplets.length === 1 ? '' : 's'}
          </Button>
        </div>
      )}

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
                  Approve {pendingCount} visual change{pendingCount === 1 ? '' : 's'}
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
              {pendingTriplets.map((p) => {
                const name = p.snapshotName;
                const failure = results?.failed.find((f) => f.name === name);
                const succeeded =
                  results !== null && !results.failed.some((f) => f.name === name);
                return (
                  <li
                    key={p.actual?.id ?? name}
                    className="flex items-start gap-3 px-5 py-3 text-xs"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.actual?.src}
                      alt={name}
                      className="h-14 w-20 shrink-0 rounded border border-border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[12px] text-fg">
                          {name}
                        </span>
                        {p.diffPercent !== undefined && (
                          <BulkDiffBadge percent={p.diffPercent} />
                        )}
                      </div>
                      {p.testTitle && (
                        <div className="mt-0.5 truncate text-fg-subtle">
                          {p.testTitle}
                        </div>
                      )}
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
                  : `${pendingCount} ready`}
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded border border-border px-1 font-mono text-[9px] text-fg-muted">
      {children}
    </span>
  );
}
