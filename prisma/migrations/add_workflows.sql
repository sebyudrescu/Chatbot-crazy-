CREATE TABLE IF NOT EXISTS "workflows" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "triggerType" TEXT NOT NULL DEFAULT 'new_message',
  "steps" TEXT NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workflows_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "workflows_botId_idx" ON "workflows"("botId");
CREATE INDEX IF NOT EXISTS "workflows_isActive_idx" ON "workflows"("isActive");
