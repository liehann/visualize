import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

const dataDir = (): string => {
  const d = process.env.DATA_DIR;
  if (!d) throw new Error('DATA_DIR is not set');
  return d;
};

export function resolveDataPath(...segments: string[]): string {
  const root = path.resolve(dataDir());
  const joined = path.resolve(root, ...segments);
  if (!joined.startsWith(root + path.sep) && joined !== root) {
    throw new Error('Path traversal detected');
  }
  return joined;
}

export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

/**
 * Persist an incoming readable stream as a file under DATA_DIR.
 * Returns the path *relative* to DATA_DIR (the form we store in the DB).
 */
export async function writeStreamToDataDir(
  stream: Readable,
  relPath: string,
): Promise<string> {
  const abs = resolveDataPath(relPath);
  await ensureDir(path.dirname(abs));
  await pipeline(stream, createWriteStream(abs));
  return relPath;
}

export async function writeBufferToDataDir(
  buffer: Buffer,
  relPath: string,
): Promise<string> {
  const abs = resolveDataPath(relPath);
  await ensureDir(path.dirname(abs));
  await fs.writeFile(abs, buffer);
  return relPath;
}

export async function readDataFile(relPath: string): Promise<Buffer> {
  return fs.readFile(resolveDataPath(relPath));
}

export async function dataFileExists(relPath: string): Promise<boolean> {
  try {
    await fs.access(resolveDataPath(relPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract a Playwright report zip into DATA_DIR. The zip is expected to be
 * the contents of `playwright-report/` (data/*.json + trace/* + resources/*).
 * Returns relative paths created.
 */
export async function extractZip(
  zipPath: string,
  destRel: string,
): Promise<string[]> {
  const destAbs = resolveDataPath(destRel);
  await ensureDir(destAbs);
  const created: string[] = [];

  await new Promise<void>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('zip open failed'));
      zip.readEntry();
      zip.on('entry', (entry) => {
        // Reject any path that escapes destAbs.
        const entryAbs = path.resolve(destAbs, entry.fileName);
        if (!entryAbs.startsWith(destAbs + path.sep) && entryAbs !== destAbs) {
          return reject(new Error(`zip slip: ${entry.fileName}`));
        }
        if (/\/$/.test(entry.fileName)) {
          fs.mkdir(entryAbs, { recursive: true })
            .then(() => zip.readEntry())
            .catch(reject);
          return;
        }
        zip.openReadStream(entry, (err2, readStream) => {
          if (err2 || !readStream) return reject(err2 ?? new Error('read fail'));
          fs.mkdir(path.dirname(entryAbs), { recursive: true })
            .then(() => pipeline(readStream, createWriteStream(entryAbs)))
            .then(() => {
              created.push(path.relative(resolveDataPath('.'), entryAbs));
              zip.readEntry();
            })
            .catch(reject);
        });
      });
      zip.on('end', () => resolve());
      zip.on('error', reject);
    });
  });

  return created;
}
