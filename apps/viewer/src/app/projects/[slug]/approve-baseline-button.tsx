'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ApproveBaselineButton({ baselineId }: { baselineId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/baselines/${baselineId}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`approve failed: ${res.status} ${body}`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        onClick={approve}
        disabled={busy}
        className="bg-success/15 text-success hover:bg-success/25"
      >
        {busy ? 'Approving…' : 'Approve'}
      </Button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  );
}
