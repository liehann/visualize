'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Drop into any server-rendered page to make it self-refresh on an
 * interval. Calls `router.refresh()` which re-runs the server component
 * tree (so server-side data fetches re-execute) without unmounting the
 * client subtree — i.e. scroll position, form state, etc. are preserved.
 *
 * Pauses while the tab is hidden so background tabs don't burn cycles
 * or DB queries.
 *
 * Default cadence is 10s — long enough that we're not hammering Postgres
 * for nothing, short enough that watching CI feels live.
 */
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let active = !document.hidden;

    function onVisibility(): void {
      active = !document.hidden;
      if (active) router.refresh();
    }
    document.addEventListener('visibilitychange', onVisibility);

    const id = setInterval(() => {
      if (active) router.refresh();
    }, intervalMs);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, router]);

  return null;
}
