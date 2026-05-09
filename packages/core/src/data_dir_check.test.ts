import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { assertDataDirWritable } from './data_dir_check.js';

describe('assertDataDirWritable', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'visualize-data-check-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('throws when DATA_DIR is undefined', async () => {
    await expect(assertDataDirWritable(undefined)).rejects.toThrow(
      /DATA_DIR is not set/,
    );
  });

  it('passes for a writable directory', async () => {
    await expect(assertDataDirWritable(tmp)).resolves.toBeUndefined();
  });

  it('fails with a clear message when the directory is read-only', async () => {
    // Simulate a read-only mount by chmod'ing the dir to 0o555.
    // Skip on Windows (different semantics) and when running as root
    // (root ignores file mode).
    if (process.platform === 'win32' || process.getuid?.() === 0) return;
    await fs.chmod(tmp, 0o555);
    try {
      await expect(assertDataDirWritable(tmp)).rejects.toThrow(
        /not writable/i,
      );
    } finally {
      await fs.chmod(tmp, 0o755);
    }
  });

  it('cleans up the marker file even when the round-trip succeeds', async () => {
    await assertDataDirWritable(tmp);
    const checkDir = path.join(tmp, '.write-check');
    const entries = await fs.readdir(checkDir).catch(() => []);
    expect(entries).toEqual([]);
  });

  it('creates parent directories if missing (recursive mkdir)', async () => {
    const nested = path.join(tmp, 'deep', 'nested', 'data');
    await expect(assertDataDirWritable(nested)).resolves.toBeUndefined();
  });
});
