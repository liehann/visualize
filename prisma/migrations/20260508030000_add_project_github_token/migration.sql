-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN "githubRepo" TEXT,
  ADD COLUMN "uploadTokenHash" TEXT,
  ADD COLUMN "tokenLastUsedAt" TIMESTAMP(3);
