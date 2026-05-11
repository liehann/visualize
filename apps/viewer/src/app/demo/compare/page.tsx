import Link from 'next/link';
import { ArrowLeftRight, GitCompare } from 'lucide-react';
import { TestStatusBadge } from '@/components/status-badge';
import { BranchPr } from '@/components/branch-pr';
import { RunVsRunDiff, type RunVsRunTriplet } from '@/components/run-vs-run-diff';
import type { TestStatus } from '@prisma/client';
import type { StatusChange } from '@/lib/run-comparison';

export const dynamic = 'force-dynamic';

function svgUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function thumb(label: string, color: string, accent: string) {
  return svgUri(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="${color}"/>
  <rect x="20" y="20" width="280" height="40" rx="6" fill="${accent}"/>
  <rect x="20" y="80" width="180" height="14" rx="3" fill="rgba(255,255,255,0.6)"/>
  <rect x="20" y="106" width="220" height="10" rx="3" fill="rgba(255,255,255,0.4)"/>
  <rect x="20" y="124" width="160" height="10" rx="3" fill="rgba(255,255,255,0.32)"/>
  <text x="160" y="180" fill="rgba(255,255,255,0.85)" font-family="ui-sans-serif, system-ui" font-size="14" text-anchor="middle">${label}</text>
</svg>`);
}

const labelA = 'main';
const labelB = 'PR #1234';

type DemoRun = {
  id: string;
  branch: string | null;
  prNumber: number | null;
  commitSha: string | null;
  ciRunUrl: string | null;
  createdAt: Date;
  totalTests: number;
  passedTests: number;
  failedTests: number;
};

const runA: DemoRun = {
  id: 'demo-a',
  branch: 'main',
  prNumber: null,
  commitSha: 'a1b2c3d4e5f6',
  ciRunUrl: null,
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
  totalTests: 42,
  passedTests: 41,
  failedTests: 1,
};

const runB: DemoRun = {
  id: 'demo-b',
  branch: 'feat/profile-redesign',
  prNumber: 1234,
  commitSha: 'def0123456789',
  ciRunUrl: null,
  createdAt: new Date(Date.now() - 1000 * 60 * 12),
  totalTests: 42,
  passedTests: 38,
  failedTests: 4,
};

const statusChanges: StatusChange[] = [
  {
    kind: 'regressed',
    testKey: 's1',
    testTitle: 'profile › avatar uploader handles 5MB+ images',
    testFile: 'tests/e2e/profile.spec.ts',
    fromStatus: 'passed' as TestStatus,
    toStatus: 'failed' as TestStatus,
    testIdA: 'a1',
    testIdB: 'b1',
  },
  {
    kind: 'regressed',
    testKey: 's2',
    testTitle: 'profile › privacy switch persists',
    testFile: 'tests/e2e/profile.spec.ts',
    fromStatus: 'passed' as TestStatus,
    toStatus: 'timedOut' as TestStatus,
    testIdA: 'a2',
    testIdB: 'b2',
  },
  {
    kind: 'fixed',
    testKey: 's3',
    testTitle: 'auth › sign-out clears local cache',
    testFile: 'tests/e2e/auth.spec.ts',
    fromStatus: 'failed' as TestStatus,
    toStatus: 'passed' as TestStatus,
    testIdA: 'a3',
    testIdB: 'b3',
  },
  {
    kind: 'added',
    testKey: 's4',
    testTitle: 'profile › theme picker persists across sessions',
    testFile: 'tests/e2e/profile.spec.ts',
    fromStatus: null,
    toStatus: 'passed' as TestStatus,
    testIdA: null,
    testIdB: 'b4',
  },
];

const visualTriplets: Array<{
  triplet: RunVsRunTriplet;
  hrefA?: string;
  hrefB?: string;
}> = [
  {
    triplet: {
      kind: 'changed',
      snapshotName: 'profile/header.png',
      testTitle: 'profile › header layout',
      actualA: thumb('profile/header (main)', '#0f1218', 'rgba(99,102,241,0.4)'),
      actualB: thumb('profile/header (PR)', '#0f1218', 'rgba(244,114,182,0.7)'),
      diffPercent: 18.6,
    },
  },
  {
    triplet: {
      kind: 'changed',
      snapshotName: 'profile/settings.png',
      testTitle: 'profile › settings panel',
      actualA: thumb('settings (main)', '#13151b', 'rgba(56,189,248,0.4)'),
      actualB: thumb('settings (PR)', '#13151b', 'rgba(56,189,248,0.65)'),
      diffPercent: 4.1,
    },
  },
  {
    triplet: {
      kind: 'added',
      snapshotName: 'profile/theme-picker.png',
      testTitle: 'profile › theme picker (new)',
      actualA: undefined,
      actualB: thumb('theme picker (new)', '#10141d', 'rgba(34,197,94,0.5)'),
    },
  },
  {
    triplet: {
      kind: 'changed',
      snapshotName: 'home/sidebar.png',
      testTitle: 'home › sidebar nav',
      actualA: thumb('sidebar (main)', '#16181f', 'rgba(168,162,158,0.35)'),
      actualB: thumb('sidebar (PR)', '#16181f', 'rgba(168,162,158,0.5)'),
      diffPercent: 0.42,
    },
  },
];

export default function CompareDemoPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/demo/lightbox" className="text-xs text-fg-subtle hover:text-fg-muted">
          ← demo lab
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <GitCompare className="h-5 w-5 text-fg-subtle" />
          <h1 className="text-xl font-semibold tracking-tight">
            Run-vs-run comparison demo
          </h1>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Fixture data — no DB. Iterates the comparison view in isolation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <RunCard run={runA} label="from" />
        <div className="hidden items-center justify-center text-fg-subtle md:flex">
          <ArrowLeftRight className="h-5 w-5" />
        </div>
        <RunCard run={runB} label="to" accent />
      </div>

      <div className="rounded-lg border border-border bg-bg-panel px-4 py-3 text-xs text-fg-subtle">
        42 tests matched · {statusChanges.length} status changes ·{' '}
        {visualTriplets.filter((v) => v.triplet.kind === 'changed').length} snapshots
        changed
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
          Status changes
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-panel">
          {statusChanges.map((c) => (
            <li
              key={c.testKey}
              className="flex items-center gap-3 px-5 py-2.5 text-xs"
            >
              <KindLabel kind={c.kind} />
              <div className="flex items-center gap-1.5">
                {c.fromStatus ? (
                  <TestStatusBadge status={c.fromStatus as TestStatus} />
                ) : (
                  <span className="text-fg-subtle">—</span>
                )}
                <span className="text-fg-subtle">→</span>
                {c.toStatus ? (
                  <TestStatusBadge status={c.toStatus as TestStatus} />
                ) : (
                  <span className="text-fg-subtle">—</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block min-w-0 truncate text-sm text-fg">{c.testTitle}</span>
                <div className="mt-0.5 truncate font-mono text-xs text-fg-subtle">
                  {c.testFile}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
          Visual changes
        </h2>
        <div className="space-y-4">
          {visualTriplets.map((v, i) => (
            <RunVsRunDiff
              key={`${v.triplet.snapshotName}-${i}`}
              triplet={v.triplet}
              labelA={labelA}
              labelB={labelB}
              hrefA={v.hrefA}
              hrefB={v.hrefB}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function KindLabel({ kind }: { kind: 'regressed' | 'fixed' | 'added' | 'removed' }) {
  const tone =
    kind === 'regressed'
      ? 'border-danger/40 bg-danger/10 text-danger'
      : kind === 'fixed'
        ? 'border-success/40 bg-success/10 text-success'
        : kind === 'added'
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-fg-subtle/30 bg-fg-subtle/10 text-fg-subtle';
  return (
    <span
      className={`inline-flex h-5 w-20 shrink-0 items-center justify-center rounded border px-1.5 text-[10px] uppercase tracking-wider ${tone}`}
    >
      {kind}
    </span>
  );
}

function RunCard({
  run,
  label,
  accent,
}: {
  run: DemoRun;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`block rounded-lg border bg-bg-panel px-4 py-3 ${
        accent ? 'border-accent/40' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-fg-subtle">
          {label}
        </span>
        <span className="text-xs text-fg-subtle">
          {Math.round((Date.now() - run.createdAt.getTime()) / 60000)}m ago
        </span>
      </div>
      <div className="mt-2">
        <BranchPr
          branch={run.branch}
          prNumber={run.prNumber}
          commitSha={run.commitSha}
        />
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-fg-subtle">
        <span>
          <span className="text-success">{run.passedTests}</span>/{run.totalTests} passed
        </span>
        {run.failedTests > 0 && (
          <span className="text-danger">{run.failedTests} failed</span>
        )}
      </div>
    </div>
  );
}
