import path from 'node:path';

export type SnapshotPathContext = {
  /** From Project.snapshotPathTemplate. */
  template: string;
  /** From Project.testDir, e.g. "tests/e2e". */
  testDir: string;
  /** Spec file from Playwright report (`spec.file`), repo-relative. */
  specFile: string;
  /** Playwright project name (e.g. "chromium", "chromium-anon"). */
  projectName: string;
  /** Runner platform — "linux" / "darwin" / "win32". */
  platform: string;
  /** First arg to toHaveScreenshot, sans extension (e.g. "race-tracker"). */
  arg: string;
  /** Defaults to ".png" — included for forward-compat with toMatchSnapshot. */
  ext?: string;
};

/**
 * Substitute Playwright-style template variables to compute the on-disk
 * baseline path the consumer's `toHaveScreenshot()` will read from.
 *
 * Variables:
 *   {testDir}       — Project.testDir as-is.
 *   {testFilePath}  — specFile relative to testDir, with the `.spec.ts`-like
 *                     suffix preserved (e.g. "golden.spec.ts").
 *   {testFileDir}   — the dir part of testFilePath (relative to testDir).
 *   {testFileName}  — the basename of testFilePath, with extension.
 *   {testFileStem}  — testFileName without its final extension.
 *   {arg}           — caller-provided arg, sans ext.
 *   {projectName}   — Playwright project name.
 *   {platform}      — runner platform.
 *   {ext}           — extension, defaults to ".png".
 *
 * Returns null if any referenced variable is missing/empty after
 * substitution — better to skip recording the path than to fabricate a
 * broken one.
 */
export function computeSnapshotPath(ctx: SnapshotPathContext): string | null {
  const ext = ctx.ext ?? '.png';
  const testFilePath = stripPrefix(ctx.specFile, ctx.testDir);
  const testFileName = path.posix.basename(testFilePath);
  const testFileStem = testFileName.replace(/\.[^.]+$/, '');
  const testFileDir = path.posix.dirname(testFilePath);

  const vars: Record<string, string> = {
    testDir: ctx.testDir,
    testFilePath,
    testFileDir: testFileDir === '.' ? '' : testFileDir,
    testFileName,
    testFileStem,
    arg: ctx.arg,
    projectName: ctx.projectName,
    platform: ctx.platform,
    ext,
  };

  let missing = false;
  const result = ctx.template.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) {
      missing = true;
      return '';
    }
    return v;
  });
  if (missing) return null;

  // Collapse any double-slashes the substitution may have produced when an
  // optional segment came back empty (e.g. {testFileDir} on a flat layout).
  return path.posix.normalize(result).replace(/\/+/g, '/');
}

function stripPrefix(p: string, prefix: string): string {
  const norm = p.replace(/\\/g, '/');
  const pre = prefix.replace(/\\/g, '/').replace(/\/$/, '');
  if (norm.startsWith(pre + '/')) return norm.slice(pre.length + 1);
  if (norm === pre) return '';
  return norm;
}
