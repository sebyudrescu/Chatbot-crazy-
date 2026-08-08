ALTER TABLE "products"
ADD COLUMN "missingSyncCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastMissingSnapshotAt" TIMESTAMP(3);

CREATE INDEX "products_sourceId_missingSyncCount_idx"
ON "products"("sourceId", "missingSyncCount");
