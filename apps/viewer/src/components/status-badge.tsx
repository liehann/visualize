import { Badge } from '@/components/ui/badge';
import type { RunStatus, TestStatus } from '@prisma/client';

const RUN_LABEL: Record<RunStatus, { label: string; variant: 'success' | 'danger' | 'warn' | 'default' | 'accent' }> = {
  passed: { label: 'passed', variant: 'success' },
  failed: { label: 'failed', variant: 'danger' },
  flaky: { label: 'flaky', variant: 'warn' },
  running: { label: 'running', variant: 'accent' },
  cancelled: { label: 'cancelled', variant: 'default' },
};

const TEST_LABEL: Record<TestStatus, { label: string; variant: 'success' | 'danger' | 'warn' | 'default' }> = {
  passed: { label: 'passed', variant: 'success' },
  expected: { label: 'expected', variant: 'success' },
  failed: { label: 'failed', variant: 'danger' },
  unexpected: { label: 'unexpected', variant: 'danger' },
  timedOut: { label: 'timed out', variant: 'danger' },
  interrupted: { label: 'interrupted', variant: 'danger' },
  flaky: { label: 'flaky', variant: 'warn' },
  skipped: { label: 'skipped', variant: 'default' },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { label, variant } = RUN_LABEL[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function TestStatusBadge({ status }: { status: TestStatus }) {
  const { label, variant } = TEST_LABEL[status];
  return <Badge variant={variant}>{label}</Badge>;
}
