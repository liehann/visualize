-- Smart diff metrics on Attachment.
--
-- Ingest computes pixelmatch on (expected, actual) for every snapshot
-- triplet that has both, and stamps the resulting pixel-mismatch counts
-- onto the diff attachment. The viewer reads these to render a
-- "12.4% changed" badge and to sort triage queues by impact.
--
-- Both columns are nullable: rows uploaded before this migration will
-- never be backfilled (the source bytes are still on disk but recomputing
-- across every historical attachment is expensive and not load-bearing —
-- new runs will populate going forward).

ALTER TABLE "Attachment"
  ADD COLUMN "diffPixels" INTEGER,
  ADD COLUMN "diffPercent" DOUBLE PRECISION;
