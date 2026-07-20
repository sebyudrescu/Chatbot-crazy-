ALTER TABLE "conversations"
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'widget',
ADD COLUMN "externalThreadId" TEXT;

ALTER TABLE "messages"
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'widget',
ADD COLUMN "externalMessageId" TEXT,
ADD COLUMN "deliveryStatus" TEXT;

CREATE UNIQUE INDEX "conversations_botId_channel_externalThreadId_key"
ON "conversations"("botId", "channel", "externalThreadId");

CREATE UNIQUE INDEX "messages_externalMessageId_key"
ON "messages"("externalMessageId");

CREATE INDEX "messages_channel_createdAt_idx"
ON "messages"("channel", "createdAt");
