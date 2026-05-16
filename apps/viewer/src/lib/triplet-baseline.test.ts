import { describe, expect, it } from 'vitest';
import { fillExpectedFromBaselines } from './triplet-baseline.js';
import type { SnapshotTriplet } from '@/components/snapshot-diff';

describe('fillExpectedFromBaselines', () => {
  it('backfills missing expected from the matching golden Baseline', () => {
    const triplets: SnapshotTriplet[] = [
      {
        snapshotName: 'home/dashboard.png',
        actual: { id: 'act', src: '/api/files/x/actual.png' },
        diff: { id: 'diff', src: '/api/files/x/diff.png' },
      },
    ];
    const [out] = fillExpectedFromBaselines(triplets, [
      { name: 'home/dashboard.png', storagePath: 'baselines/home/dashboard.png' },
    ]);
    expect(out?.expected).toEqual({
      src: '/api/files/baselines/home/dashboard.png',
      fromBaseline: true,
    });
    // Approve still targets the actual attachment, untouched.
    expect(out?.actual?.id).toBe('act');
  });

  it('keeps a report-embedded expected and never overwrites it', () => {
    const triplets: SnapshotTriplet[] = [
      {
        snapshotName: 'auth/sign-in.png',
        expected: { id: 'exp', src: '/api/files/x/expected.png' },
        actual: { id: 'act', src: '/api/files/x/actual.png' },
      },
    ];
    const [out] = fillExpectedFromBaselines(triplets, [
      { name: 'auth/sign-in.png', storagePath: 'baselines/auth/sign-in.png' },
    ]);
    expect(out?.expected).toEqual({ id: 'exp', src: '/api/files/x/expected.png' });
  });

  it('leaves the triplet untouched when no Baseline matches the name', () => {
    const triplets: SnapshotTriplet[] = [
      { snapshotName: 'orphan.png', actual: { id: 'a', src: '/api/files/a.png' } },
    ];
    const [out] = fillExpectedFromBaselines(triplets, [
      { name: 'something-else.png', storagePath: 'baselines/something-else.png' },
    ]);
    expect(out?.expected).toBeUndefined();
  });
});
