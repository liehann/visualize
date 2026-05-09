/**
 * Next.js startup instrumentation. Runs once when the server boots.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Used here for fail-fast on a misconfigured DATA_DIR volume mount —
 * the same class of bug that took prod's approve flow down (read-only
 * mount swallowed every write with an opaque ENOENT). Skipped under
 * `next build` so we don't need a writable filesystem at build time.
 */
export async function register(): Promise<void> {
  // Don't run during build (no real DATA_DIR + the build phase may
  // execute server-only modules speculatively).
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.NODE_ENV === 'test') return;

  const { assertDataDirWritable } = await import('@visualize/core/data_dir_check');
  try {
    await assertDataDirWritable(process.env.DATA_DIR);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[viewer] DATA_DIR write check failed:', err);
    process.exit(1);
  }
}
