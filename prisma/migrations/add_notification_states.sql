CREATE TABLE IF NOT EXISTS "notification_states" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "dismissed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_states_key_key" ON "notification_states"("key");
CREATE INDEX IF NOT EXISTS "notification_states_readAt_idx" ON "notification_states"("readAt");
CREATE INDEX IF NOT EXISTS "notification_states_dismissed_idx" ON "notification_states"("dismissed");
