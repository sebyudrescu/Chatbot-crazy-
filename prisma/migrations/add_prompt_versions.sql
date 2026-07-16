CREATE TABLE IF NOT EXISTS "prompt_versions" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "systemPrompt" TEXT,
  "promptTemplateId" TEXT,
  "settings" TEXT NOT NULL DEFAULT '{}',
  "changeSummary" TEXT,
  "createdBy" TEXT NOT NULL DEFAULT 'owner',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prompt_versions_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_versions_botId_version_key" ON "prompt_versions"("botId", "version");
CREATE INDEX IF NOT EXISTS "prompt_versions_botId_createdAt_idx" ON "prompt_versions"("botId", "createdAt");
