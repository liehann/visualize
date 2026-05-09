import { describe, expect, it } from 'vitest';
import { computeSnapshotPath } from './snapshot_path.js';

describe('computeSnapshotPath', () => {
  it('substitutes the kuruvu_track template end-to-end', () => {
    const out = computeSnapshotPath({
      template:
        '{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}',
      testDir: 'tests/e2e',
      specFile: 'tests/e2e/golden.spec.ts',
      projectName: 'chromium',
      platform: 'linux',
      arg: 'race-tracker',
    });
    expect(out).toBe(
      'tests/e2e/__screenshots__/golden.spec.ts/race-tracker-chromium-linux.png',
    );
  });

  it('handles a flat layout where {testFileDir} comes back empty', () => {
    const out = computeSnapshotPath({
      template:
        '{testDir}/{testFileDir}/{testFileStem}-snapshots/{arg}-{platform}{ext}',
      testDir: 'tests',
      specFile: 'tests/foo.spec.ts',
      projectName: 'chromium',
      platform: 'linux',
      arg: 'shot',
    });
    expect(out).toBe('tests/foo.spec-snapshots/shot-linux.png');
  });

  it('preserves nested test file directories', () => {
    const out = computeSnapshotPath({
      template:
        '{testDir}/__screenshots__/{testFileDir}/{testFileName}/{arg}{ext}',
      testDir: 'e2e',
      specFile: 'e2e/auth/login.spec.ts',
      projectName: 'chromium',
      platform: 'linux',
      arg: 'login',
    });
    expect(out).toBe('e2e/__screenshots__/auth/login.spec.ts/login.png');
  });

  it('returns null on unknown variable references', () => {
    const out = computeSnapshotPath({
      template: '{testDir}/{whoIsThis}/{arg}{ext}',
      testDir: 'tests/e2e',
      specFile: 'tests/e2e/x.spec.ts',
      projectName: 'chromium',
      platform: 'linux',
      arg: 'foo',
    });
    expect(out).toBeNull();
  });

  it('keeps the spec path unchanged when it doesn’t live under testDir', () => {
    const out = computeSnapshotPath({
      template: '{testFilePath}-snapshots/{arg}{ext}',
      testDir: 'tests/e2e',
      specFile: 'apps/admin-web/some.spec.ts',
      projectName: 'chromium',
      platform: 'linux',
      arg: 'x',
    });
    expect(out).toBe('apps/admin-web/some.spec.ts-snapshots/x.png');
  });
});
