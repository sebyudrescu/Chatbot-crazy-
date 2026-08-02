ALTER TABLE "integration_connections"
  ADD COLUMN "externalAccountId" TEXT;

ALTER TABLE "commerce_events"
  ADD COLUMN "externalEventId" TEXT;

CREATE UNIQUE INDEX "commerce_events_externalEventId_key"
  ON "commerce_events"("externalEventId");

CREATE INDEX "integration_connections_provider_externalAccountId_idx"
  ON "integration_connections"("provider", "externalAccountId");

CREATE TABLE "commerce_webhook_deliveries" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "error" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commerce_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commerce_webhook_deliveries_externalId_key"
  ON "commerce_webhook_deliveries"("externalId");
CREATE INDEX "commerce_webhook_deliveries_botId_createdAt_idx"
  ON "commerce_webhook_deliveries"("botId", "createdAt");
CREATE INDEX "commerce_webhook_deliveries_provider_status_idx"
  ON "commerce_webhook_deliveries"("provider", "status");

ALTER TABLE "commerce_webhook_deliveries"
  ADD CONSTRAINT "commerce_webhook_deliveries_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "commerce_tracking_keys" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "config" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commerce_tracking_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commerce_tracking_keys_botId_key"
  ON "commerce_tracking_keys"("botId");
CREATE INDEX "commerce_tracking_keys_active_idx"
  ON "commerce_tracking_keys"("active");

ALTER TABLE "commerce_tracking_keys"
  ADD CONSTRAINT "commerce_tracking_keys_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
