-- Path-keyed baselines + per-project snapshot path template.
--
-- Visualize is now the single source of truth for goldens. Approve in the
-- viewer is the only baseline-edit surface; CI fetches by `path` before
-- Playwright runs. The path is computed at approve time from
-- `Project.snapshotPathTemplate` + attachment metadata.

-- 1. Per-project snapshot path template + testDir (defaults match
--    kuruvu_track / Playwright convention).
ALTER TABLE "Project"
  ADD COLUMN "snapshotPathTemplate" TEXT NOT NULL DEFAULT '{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}',
  ADD COLUMN "testDir" TEXT NOT NULL DEFAULT 'tests/e2e';

-- 2. Add `path` to Baseline. We backfill from the existing
--    (name, browser, platform) tuple using the default template so any
--    pre-existing baselines remain reachable. New rows always get an
--    explicit, computed path.
ALTER TABLE "Baseline" ADD COLUMN "path" TEXT;

UPDATE "Baseline" SET "path" =
  'tests/e2e/__screenshots__/' ||
  -- We don't know the original spec file for legacy baselines, so we
  -- bucket them under "_legacy/" — they remain fetchable but reviewers
  -- should re-approve in the viewer to get the correct path going forward.
  '_legacy/' || "name" || '-' || "browser" || '-' || "platform" || '.png';

ALTER TABLE "Baseline" ALTER COLUMN "path" SET NOT NULL;

-- 3. Swap the unique constraint over to (projectId, path). The old tuple
--    becomes informational; we keep the columns for approval-time lookup
--    when the consumer's template hasn't changed.
DROP INDEX "Baseline_projectId_name_browser_platform_key";
CREATE UNIQUE INDEX "Baseline_projectId_path_key" ON "Baseline"("projectId", "path");

-- 4. Approve handler needs to know which OS to substitute for {platform};
--    parser writes it into Attachment.snapshotPath at ingest time so
--    approve doesn't have to guess.
ALTER TABLE "Run" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'linux';
ALTER TABLE "Attachment" ADD COLUMN "snapshotPath" TEXT;
