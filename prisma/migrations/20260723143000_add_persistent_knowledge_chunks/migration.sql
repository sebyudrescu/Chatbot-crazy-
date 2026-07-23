CREATE TABLE "knowledge_chunks" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "chunkKey" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "embedding" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_chunks_botId_chunkKey_key"
ON "knowledge_chunks"("botId", "chunkKey");

CREATE INDEX "knowledge_chunks_botId_idx"
ON "knowledge_chunks"("botId");

CREATE INDEX "knowledge_chunks_sourceId_idx"
ON "knowledge_chunks"("sourceId");

ALTER TABLE "knowledge_chunks"
ADD CONSTRAINT "knowledge_chunks_botId_fkey"
FOREIGN KEY ("botId") REFERENCES "chatbots"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_chunks"
ADD CONSTRAINT "knowledge_chunks_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "knowledge_sources"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
