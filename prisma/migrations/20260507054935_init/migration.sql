-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('running', 'passed', 'failed', 'flaky', 'cancelled');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('passed', 'failed', 'timedOut', 'skipped', 'interrupted', 'expected', 'unexpected', 'flaky');

-- CreateEnum
CREATE TYPE "AnnotationSource" AS ENUM ('human', 'claude', 'ci');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('screenshot', 'video', 'trace', 'text', 'other');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('actual', 'expected', 'diff');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "commitSha" TEXT,
    "branch" TEXT,
    "prNumber" INTEGER,
    "ciProvider" TEXT,
    "ciRunUrl" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "totalTests" INTEGER NOT NULL DEFAULT 0,
    "passedTests" INTEGER NOT NULL DEFAULT 0,
    "failedTests" INTEGER NOT NULL DEFAULT 0,
    "flakyTests" INTEGER NOT NULL DEFAULT 0,
    "skippedTests" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT NOT NULL,
    "rawConfig" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "titlePath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "line" INTEGER,
    "column" INTEGER,
    "projectName" TEXT,
    "status" "TestStatus" NOT NULL,
    "expectedStatus" "TestStatus",
    "durationMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestResult" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "retry" INTEGER NOT NULL DEFAULT 0,
    "status" "TestStatus" NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "workerIndex" INTEGER,
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "errorSnippet" TEXT,
    "stdout" TEXT,
    "stderr" TEXT,

    CONSTRAINT "TestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "testResultId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "kind" "AttachmentKind" NOT NULL,
    "snapshotKind" "SnapshotKind",
    "snapshotName" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "shape" JSONB NOT NULL,
    "label" TEXT,
    "author" TEXT,
    "source" "AnnotationSource" NOT NULL DEFAULT 'human',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Baseline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "browser" TEXT,
    "platform" TEXT,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commitSha" TEXT,
    "branch" TEXT,
    "approvedFromAttachmentId" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Baseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Run_projectId_createdAt_idx" ON "Run"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Run_commitSha_idx" ON "Run"("commitSha");

-- CreateIndex
CREATE INDEX "Run_prNumber_idx" ON "Run"("prNumber");

-- CreateIndex
CREATE INDEX "Run_branch_idx" ON "Run"("branch");

-- CreateIndex
CREATE INDEX "TestCase_runId_idx" ON "TestCase"("runId");

-- CreateIndex
CREATE INDEX "TestCase_runId_status_idx" ON "TestCase"("runId", "status");

-- CreateIndex
CREATE INDEX "TestResult_testCaseId_idx" ON "TestResult"("testCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TestResult_testCaseId_retry_key" ON "TestResult"("testCaseId", "retry");

-- CreateIndex
CREATE INDEX "Attachment_testResultId_idx" ON "Attachment"("testResultId");

-- CreateIndex
CREATE INDEX "Attachment_snapshotName_idx" ON "Attachment"("snapshotName");

-- CreateIndex
CREATE INDEX "Annotation_attachmentId_idx" ON "Annotation"("attachmentId");

-- CreateIndex
CREATE INDEX "Baseline_projectId_idx" ON "Baseline"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Baseline_projectId_name_browser_platform_key" ON "Baseline"("projectId", "name", "browser", "platform");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Baseline" ADD CONSTRAINT "Baseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
