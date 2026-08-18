CREATE TABLE "response_revisions" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "assistantMessageId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "question" TEXT NOT NULL,
  "originalAnswer" TEXT NOT NULL,
  "revisedAnswer" TEXT NOT NULL,
  "rationale" TEXT,
  "expectedKeywords" TEXT NOT NULL DEFAULT '[]',
  "forbiddenKeywords" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "knowledgeSourceId" TEXT,
  "evaluationCaseId" TEXT,
  "createdBy" TEXT NOT NULL DEFAULT 'owner',
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "response_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "response_revisions_knowledgeSourceId_key" ON "response_revisions"("knowledgeSourceId");
CREATE UNIQUE INDEX "response_revisions_evaluationCaseId_key" ON "response_revisions"("evaluationCaseId");
CREATE UNIQUE INDEX "response_revisions_assistantMessageId_version_key" ON "response_revisions"("assistantMessageId", "version");
CREATE INDEX "response_revisions_botId_status_updatedAt_idx" ON "response_revisions"("botId", "status", "updatedAt");
CREATE INDEX "response_revisions_conversationId_createdAt_idx" ON "response_revisions"("conversationId", "createdAt");

ALTER TABLE "response_revisions" ADD CONSTRAINT "response_revisions_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "response_revisions" ADD CONSTRAINT "response_revisions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "response_revisions" ADD CONSTRAINT "response_revisions_assistantMessageId_fkey" FOREIGN KEY ("assistantMessageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "response_revisions" ADD CONSTRAINT "response_revisions_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "knowledge_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "response_revisions" ADD CONSTRAINT "response_revisions_evaluationCaseId_fkey" FOREIGN KEY ("evaluationCaseId") REFERENCES "evaluation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
