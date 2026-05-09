import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Verify DATA_DIR is configured and writable. Run at startup so a
 * misconfigured volume mount (or a typo in the env var) fails the
 * service immediately with a clear message — instead of letting the
 * first user-driven write fail with an opaque ENOENT/EROFS later, like
 * the read-only mount bug that took prod's approve flow down.
 *
 * Idempotent + cheap: creates a marker file under .write-check/, writes
 * + reads it back, then deletes. Throws on any failure so the caller
 * can fail-fast.
 */
export async function assertDataDirWritable(dataDir: string | undefined): Promise<void> {
  if (!dataDir) {
    throw new Error(
      'DATA_DIR is not set. Provide a writable directory path via the DATA_DIR env var.',
    );
  }
  const checkDir = path.join(dataDir, '.write-check');
  const markerName = `boot-${process.pid}-${Date.now()}.txt`;
  const marker = path.join(checkDir, markerName);
  const expected = `ok ${markerName}`;
  try {
    await fs.mkdir(checkDir, { recursive: true });
    await fs.writeFile(marker, expected);
    const back = await fs.readFile(marker, 'utf8');
    if (back !== expected) {
      throw new Error(
        `DATA_DIR write-check round-trip mismatch (got ${JSON.stringify(back)}, expected ${JSON.stringify(expected)})`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `DATA_DIR ("${dataDir}") is not writable: ${msg}. ` +
        'Check the volume mount mode (a `:ro` mount silently breaks every write path) and the ' +
        "service user's permissions on the directory.",
    );
  } finally {
    await fs.unlink(marker).catch(() => undefined);
  }
}
