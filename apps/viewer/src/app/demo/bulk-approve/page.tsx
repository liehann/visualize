import { BulkApprove } from '@/components/bulk-approve';
import type { SnapshotTriplet } from '@/components/snapshot-diff';

export const dynamic = 'force-dynamic';

function svgUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function thumbSvg(label: string, color: string) {
  return svgUri(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="${color}"/>
  <rect x="20" y="20" width="280" height="40" rx="6" fill="rgba(255,255,255,0.18)"/>
  <rect x="20" y="80" width="180" height="14" rx="3" fill="rgba(255,255,255,0.6)"/>
  <rect x="20" y="106" width="220" height="10" rx="3" fill="rgba(255,255,255,0.4)"/>
  <rect x="20" y="124" width="160" height="10" rx="3" fill="rgba(255,255,255,0.32)"/>
  <text x="160" y="180" fill="rgba(255,255,255,0.85)" font-family="ui-sans-serif, system-ui" font-size="14" text-anchor="middle">${label}</text>
</svg>`);
}

function demoTriplet(
  id: string,
  snapshotName: string,
  testTitle: string,
  label: string,
  color: string,
  diffPercent: number,
): SnapshotTriplet {
  return {
    snapshotName,
    testTitle,
    actual: { id, src: thumbSvg(label, color) },
    diffPercent,
  };
}

const triplets: SnapshotTriplet[] = [
  demoTriplet('demo-1', 'home/dashboard.png', 'home > dashboard renders for signed-in user', 'home/dashboard', '#1f1f24', 12.4),
  demoTriplet('demo-2', 'auth/sign-in.png', 'auth > sign-in / form', 'auth/sign-in', '#0e1422', 5.2),
  demoTriplet('demo-3', 'projects/empty-state.png', 'projects > empty state', 'projects/empty', '#0c0e12', 0.04),
  demoTriplet('demo-4', 'runs/detail/header.png', 'runs > detail header shows branch + PR', 'runs/detail', '#16161a', 1.8),
  demoTriplet('demo-5', 'runs/detail/footer.png', 'runs > detail / footer test list', 'runs/footer', '#1a1a1f', 0.13),
];

export default function BulkApproveDemoPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wider text-fg-subtle">Design lab</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Bulk approve demo</h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          The pending-changes banner. Click &ldquo;approve all&rdquo; to see the
          confirmation sheet. The fake POST will fail (no DB), letting you see
          the error path too.
        </p>
      </header>
      <BulkApprove runId="demo-run" triplets={triplets} />
    </div>
  );
}
