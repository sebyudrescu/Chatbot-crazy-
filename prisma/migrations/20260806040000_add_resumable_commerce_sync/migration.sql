ALTER TABLE "product_sync_jobs"
ADD COLUMN "leaseVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "checkpoint" TEXT,
ADD COLUMN "snapshotStartedAt" TIMESTAMP(3),
ADD COLUMN "pagesProcessed" INTEGER NOT NULL DEFAULT 0;
