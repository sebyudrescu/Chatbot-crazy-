CREATE TABLE IF NOT EXISTS "improvement_suggestions" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "botId" TEXT,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "impact" TEXT NOT NULL DEFAULT 'medium',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "actionType" TEXT NOT NULL,
  "actionPayload" TEXT NOT NULL DEFAULT '{}',
  "evidence" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "improvement_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "improvement_suggestions_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "improvement_suggestions_key_key" ON "improvement_suggestions"("key");
CREATE INDEX IF NOT EXISTS "improvement_suggestions_botId_status_idx" ON "improvement_suggestions"("botId", "status");
CREATE INDEX IF NOT EXISTS "improvement_suggestions_category_status_idx" ON "improvement_suggestions"("category", "status");
CREATE INDEX IF NOT EXISTS "improvement_suggestions_impact_idx" ON "improvement_suggestions"("impact");
