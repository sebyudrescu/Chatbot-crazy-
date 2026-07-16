CREATE TABLE IF NOT EXISTS "integration_connections" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "config" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'disconnected',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "lastTestedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integration_connections_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "integration_connections_botId_provider_key" ON "integration_connections"("botId", "provider");
CREATE INDEX IF NOT EXISTS "integration_connections_botId_enabled_idx" ON "integration_connections"("botId", "enabled");
CREATE INDEX IF NOT EXISTS "integration_connections_category_idx" ON "integration_connections"("category");
