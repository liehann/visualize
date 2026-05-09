import { describe, expect, it } from 'vitest';
import {
  diffStatus,
  categorizeTests,
  sortVisualChanges,
  type TestRow,
  type VisualChange,
} from './run-comparison.js';

describe('diffStatus', () => {
  it('regression when passed → failed', () => {
    expect(diffStatus('passed', 'failed')).toBe('regressed');
    expect(diffStatus('expected', 'unexpected')).toBe('regressed');
    expect(diffStatus('passed', 'timedOut')).toBe('regressed');
  });

  it('fix when failed → passed', () => {
    expect(diffStatus('failed', 'passed')).toBe('fixed');
    expect(diffStatus('timedOut', 'expected')).toBe('fixed');
  });

  it('added when no prior, removed when no current', () => {
    expect(diffStatus(null, 'passed')).toBe('added');
    expect(diffStatus('passed', null)).toBe('removed');
  });

  it('null when both null', () => {
    expect(diffStatus(null, null)).toBe(null);
  });

  it('null when both pass-classified', () => {
    expect(diffStatus('passed', 'expected')).toBe(null);
  });

  it('null when both fail-classified', () => {
    expect(diffStatus('failed', 'timedOut')).toBe(null);
  });

  it('skipped → passed is not a "fix" — only fail→pass is', () => {
    expect(diffStatus('skipped', 'passed')).toBe(null);
  });
});

function makeTest(opts: {
  id?: string;
  file: string;
  titlePath: string;
  status: TestRow['status'];
  projectName?: string | null;
  actuals?: Array<{ id: string; name: string; storagePath: string }>;
}): TestRow {
  return {
    id: opts.id ?? `tc-${opts.file}-${opts.titlePath}`,
    titlePath: opts.titlePath,
    title: opts.titlePath.split(' › ').pop() ?? opts.titlePath,
    file: opts.file,
    projectName: opts.projectName ?? null,
    status: opts.status,
    results: [
      {
        id: `tr-${opts.id ?? opts.titlePath}-0`,
        retry: 0,
        attachments: (opts.actuals ?? []).map((a) => ({
          id: a.id,
          snapshotKind: 'actual' as const,
          snapshotName: a.name,
          storagePath: a.storagePath,
        })),
      },
    ],
  };
}

describe('categorizeTests', () => {
  it('flags regressions, fixes, additions, removals', () => {
    const a = [
      makeTest({ file: 'a.spec.ts', titlePath: 'green stays green', status: 'passed' }),
      makeTest({ file: 'a.spec.ts', titlePath: 'will regress', status: 'passed' }),
      makeTest({ file: 'a.spec.ts', titlePath: 'will fix', status: 'failed' }),
      makeTest({ file: 'a.spec.ts', titlePath: 'will be removed', status: 'passed' }),
    ];
    const b = [
      makeTest({ file: 'a.spec.ts', titlePath: 'green stays green', status: 'passed' }),
      makeTest({ file: 'a.spec.ts', titlePath: 'will regress', status: 'failed' }),
      makeTest({ file: 'a.spec.ts', titlePath: 'will fix', status: 'passed' }),
      makeTest({ file: 'a.spec.ts', titlePath: 'newly added', status: 'failed' }),
    ];
    const result = categorizeTests(a, b);
    const byKind = Object.fromEntries(
      result.statusChanges.map((c) => [c.kind, c.testTitle]),
    );
    expect(byKind).toEqual({
      regressed: 'will regress',
      fixed: 'will fix',
      added: 'newly added',
      removed: 'will be removed',
    });
    expect(result.statusChanges.map((c) => c.kind)).toEqual([
      'regressed',
      'fixed',
      'added',
      'removed',
    ]);
  });

  it('matches tests across runs by (file, titlePath, projectName)', () => {
    const a = [
      makeTest({
        file: 'a.spec.ts',
        titlePath: 'shared title',
        status: 'passed',
        projectName: 'chromium',
      }),
      makeTest({
        file: 'a.spec.ts',
        titlePath: 'shared title',
        status: 'passed',
        projectName: 'firefox',
      }),
    ];
    const b = [
      makeTest({
        file: 'a.spec.ts',
        titlePath: 'shared title',
        status: 'failed',
        projectName: 'chromium',
      }),
      makeTest({
        file: 'a.spec.ts',
        titlePath: 'shared title',
        status: 'passed',
        projectName: 'firefox',
      }),
    ];
    const result = categorizeTests(a, b);
    expect(result.matchedTestCount).toBe(2);
    expect(result.statusChanges).toHaveLength(1);
    expect(result.statusChanges[0]?.kind).toBe('regressed');
  });

  it('emits visual candidates for matched tests with snapshots on either or both sides', () => {
    const a = [
      makeTest({
        file: 'a.spec.ts',
        titlePath: 't1',
        status: 'passed',
        actuals: [
          { id: 'aA', name: 'home', storagePath: 'a/home.png' },
          { id: 'aB', name: 'login', storagePath: 'a/login.png' },
        ],
      }),
    ];
    const b = [
      makeTest({
        file: 'a.spec.ts',
        titlePath: 't1',
        status: 'passed',
        actuals: [
          { id: 'bA', name: 'home', storagePath: 'b/home.png' },
          { id: 'bC', name: 'settings', storagePath: 'b/settings.png' },
        ],
      }),
    ];
    const result = categorizeTests(a, b);
    const byName = new Map(result.visualCandidates.map((v) => [v.snapshotName, v]));
    expect(byName.get('home')?.aEntry?.attachmentId).toBe('aA');
    expect(byName.get('home')?.bEntry?.attachmentId).toBe('bA');
    // login: only on A
    expect(byName.get('login')?.aEntry?.attachmentId).toBe('aB');
    expect(byName.get('login')?.bEntry).toBeNull();
    // settings: only on B
    expect(byName.get('settings')?.aEntry).toBeNull();
    expect(byName.get('settings')?.bEntry?.attachmentId).toBe('bC');
  });

  it('uses the highest-retry result for snapshot collection', () => {
    const t: TestRow = {
      id: 'tc1',
      titlePath: 'flaky',
      title: 'flaky',
      file: 'a.spec.ts',
      projectName: null,
      status: 'passed',
      results: [
        {
          id: 'r0',
          retry: 0,
          attachments: [
            {
              id: 'old',
              snapshotKind: 'actual',
              snapshotName: 'home',
              storagePath: 'old.png',
            },
          ],
        },
        {
          id: 'r1',
          retry: 1,
          attachments: [
            {
              id: 'new',
              snapshotKind: 'actual',
              snapshotName: 'home',
              storagePath: 'new.png',
            },
          ],
        },
      ],
    };
    const result = categorizeTests([t], [t]);
    expect(result.visualCandidates).toHaveLength(1);
    expect(result.visualCandidates[0]?.aEntry?.attachmentId).toBe('new');
  });

  it('does not emit visual candidates for status-only changes when only one side has snapshots', () => {
    // Test removed in B → only A has snapshots; we surface them as
    // "removed" candidates so the comparison view can show "this test
    // and its screenshot are gone".
    const a = [
      makeTest({
        file: 'a.spec.ts',
        titlePath: 'gone',
        status: 'passed',
        actuals: [{ id: 'aA', name: 'home', storagePath: 'a/home.png' }],
      }),
    ];
    const b: TestRow[] = [];
    const result = categorizeTests(a, b);
    expect(result.statusChanges.map((c) => c.kind)).toEqual(['removed']);
    expect(result.visualCandidates).toHaveLength(1);
    expect(result.visualCandidates[0]?.bEntry).toBeNull();
  });
});

describe('sortVisualChanges', () => {
  it('sorts changed before added before removed, then by diffPercent desc', () => {
    const sample: VisualChange[] = [
      mkVC('changed', 'low', 0.5),
      mkVC('changed', 'high', 12),
      mkVC('added', 'a1'),
      mkVC('removed', 'r1'),
      mkVC('changed', 'mid', 3),
    ];
    const sorted = sortVisualChanges(sample);
    expect(sorted.map((v) => v.snapshotName)).toEqual([
      'high',
      'mid',
      'low',
      'a1',
      'r1',
    ]);
  });
});

function mkVC(
  kind: VisualChange['kind'],
  snapshotName: string,
  diffPercent: number | null = null,
): VisualChange {
  return {
    kind,
    testKey: 'k',
    testTitle: 't',
    testFile: 'a.spec.ts',
    testIdA: 'a',
    testIdB: 'b',
    snapshotName,
    actualASrc: '/a.png',
    actualBSrc: '/b.png',
    diffPercent,
    diffPixels: null,
  };
}
