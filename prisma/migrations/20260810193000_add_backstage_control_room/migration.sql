CREATE TABLE "backstage_sessions" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "backstage_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "backstage_messages" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'message',
  "content" TEXT NOT NULL,
  "evidence" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "backstage_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "backstage_drafts" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "beforeState" TEXT NOT NULL DEFAULT '{}',
  "evidence" TEXT NOT NULL DEFAULT '[]',
  "validation" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "appliedResourceId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "rolledBackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "backstage_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "backstage_sessions_botId_updatedAt_idx" ON "backstage_sessions"("botId", "updatedAt");
CREATE INDEX "backstage_sessions_status_idx" ON "backstage_sessions"("status");
CREATE INDEX "backstage_messages_sessionId_createdAt_idx" ON "backstage_messages"("sessionId", "createdAt");
CREATE INDEX "backstage_drafts_sessionId_createdAt_idx" ON "backstage_drafts"("sessionId", "createdAt");
CREATE INDEX "backstage_drafts_botId_status_idx" ON "backstage_drafts"("botId", "status");

ALTER TABLE "backstage_sessions" ADD CONSTRAINT "backstage_sessions_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backstage_messages" ADD CONSTRAINT "backstage_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "backstage_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backstage_drafts" ADD CONSTRAINT "backstage_drafts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "backstage_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backstage_drafts" ADD CONSTRAINT "backstage_drafts_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
