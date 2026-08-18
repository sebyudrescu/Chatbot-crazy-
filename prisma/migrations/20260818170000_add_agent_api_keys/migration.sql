CREATE TABLE "agent_api_keys" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "scopes" TEXT NOT NULL DEFAULT '["chat:write"]',
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_api_keys_secretHash_key" ON "agent_api_keys"("secretHash");
CREATE INDEX "agent_api_keys_botId_revokedAt_idx" ON "agent_api_keys"("botId", "revokedAt");
CREATE INDEX "agent_api_keys_keyPrefix_idx" ON "agent_api_keys"("keyPrefix");
CREATE INDEX "agent_api_keys_expiresAt_idx" ON "agent_api_keys"("expiresAt");

ALTER TABLE "agent_api_keys" ADD CONSTRAINT "agent_api_keys_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
