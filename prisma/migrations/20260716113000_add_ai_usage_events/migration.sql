CREATE TABLE "ai_usage_events" (
  "id" TEXT NOT NULL,
  "botId" TEXT,
  "conversationId" TEXT,
  "feature" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'openai',
  "model" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "durationMs" INTEGER,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_usage_events"
ADD CONSTRAINT "ai_usage_events_botId_fkey"
FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ai_usage_events_botId_createdAt_idx" ON "ai_usage_events"("botId", "createdAt");
CREATE INDEX "ai_usage_events_conversationId_idx" ON "ai_usage_events"("conversationId");
CREATE INDEX "ai_usage_events_feature_createdAt_idx" ON "ai_usage_events"("feature", "createdAt");
CREATE INDEX "ai_usage_events_model_createdAt_idx" ON "ai_usage_events"("model", "createdAt");
