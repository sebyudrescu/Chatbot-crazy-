ALTER TABLE "conversations"
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN "handoffSequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "firstResponseDueAt" TIMESTAMP(3),
  ADD COLUMN "resolutionDueAt" TIMESTAMP(3),
  ADD COLUMN "firstHumanResponseAt" TIMESTAMP(3),
  ADD COLUMN "lastHumanResponseAt" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "reopenedAt" TIMESTAMP(3);

ALTER TABLE "messages"
  ADD COLUMN "operatorAuthored" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_priority_check"
  CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));

-- Preserve the fact that an already-open handoff is at least the first cycle,
-- without inventing historical response or resolution timestamps.
UPDATE "conversations"
SET "handoffSequence" = 1
WHERE "needsHumanEscalation" = true AND "handoffSequence" = 0;

CREATE INDEX "conversations_helpdesk_queue_idx"
  ON "conversations"("botId", "isResolved", "needsHumanEscalation", "priority", "lastMessageAt");
CREATE INDEX "conversations_first_response_sla_idx"
  ON "conversations"("botId", "needsHumanEscalation", "firstResponseDueAt");
CREATE INDEX "conversations_resolution_sla_idx"
  ON "conversations"("botId", "isResolved", "resolutionDueAt");

CREATE TABLE "helpdesk_saved_views" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filters" TEXT NOT NULL DEFAULT '{}',
  "sort" TEXT NOT NULL DEFAULT 'recent',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "helpdesk_saved_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "helpdesk_saved_views_name_key"
  ON "helpdesk_saved_views"("name");
CREATE INDEX "helpdesk_saved_views_isDefault_updatedAt_idx"
  ON "helpdesk_saved_views"("isDefault", "updatedAt");
CREATE UNIQUE INDEX "helpdesk_saved_views_single_default_idx"
  ON "helpdesk_saved_views"("isDefault")
  WHERE "isDefault" = true;
