-- Baseline for databases created before Prisma migration history existed.
-- Existing LitX databases already contain chatbots, so this migration is a safe no-op there.
DO $litx_baseline$
BEGIN
  IF to_regclass('public.chatbots') IS NULL THEN
    -- CreateTable
    CREATE TABLE "chatbots" (
        "id" TEXT NOT NULL,
        "companyName" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "trialEndDate" TIMESTAMP(3),
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "settings" TEXT,
        "promptTemplateId" TEXT,
        "systemPrompt" TEXT,
        "promptVariables" TEXT,
        "kbStatus" TEXT NOT NULL DEFAULT 'empty',
        "kbLastIndexed" TIMESTAMP(3),
        "kbTotalChunks" INTEGER NOT NULL DEFAULT 0,
        "kbIndexingError" TEXT,
    
        CONSTRAINT "chatbots_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "prompt_versions" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "version" INTEGER NOT NULL,
        "systemPrompt" TEXT,
        "promptTemplateId" TEXT,
        "settings" TEXT NOT NULL DEFAULT '{}',
        "changeSummary" TEXT,
        "createdBy" TEXT NOT NULL DEFAULT 'owner',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "crm_contacts" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "identityKey" TEXT NOT NULL,
        "name" TEXT,
        "email" TEXT,
        "phone" TEXT,
        "company" TEXT,
        "source" TEXT NOT NULL DEFAULT 'chat',
        "stage" TEXT NOT NULL DEFAULT 'new',
        "leadScore" INTEGER NOT NULL DEFAULT 10,
        "potentialValue" DOUBLE PRECISION,
        "tags" TEXT NOT NULL DEFAULT '[]',
        "notes" TEXT NOT NULL DEFAULT '[]',
        "consentStatus" TEXT NOT NULL DEFAULT 'unknown',
        "lastConversationId" TEXT,
        "lastInteraction" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "notification_states" (
        "id" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "readAt" TIMESTAMP(3),
        "dismissed" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "notification_states_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "improvement_suggestions" (
        "id" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "botId" TEXT,
        "category" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "impact" TEXT NOT NULL DEFAULT 'medium',
        "status" TEXT NOT NULL DEFAULT 'pending',
        "actionType" TEXT NOT NULL,
        "actionPayload" TEXT NOT NULL DEFAULT '{}',
        "evidence" TEXT NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "improvement_suggestions_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "agent_actions" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "description" TEXT,
        "triggerKeywords" TEXT NOT NULL DEFAULT '[]',
        "config" TEXT NOT NULL DEFAULT '{}',
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "action_executions" (
        "id" TEXT NOT NULL,
        "actionId" TEXT NOT NULL,
        "conversationId" TEXT,
        "success" BOOLEAN NOT NULL,
        "input" TEXT,
        "output" TEXT,
        "error" TEXT,
        "durationMs" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "action_executions_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "integration_connections" (
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
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "evaluation_cases" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "question" TEXT NOT NULL,
        "expectedKeywords" TEXT NOT NULL DEFAULT '[]',
        "forbiddenKeywords" TEXT NOT NULL DEFAULT '[]',
        "minimumConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "evaluation_cases_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "evaluation_runs" (
        "id" TEXT NOT NULL,
        "caseId" TEXT NOT NULL,
        "passed" BOOLEAN NOT NULL,
        "response" TEXT NOT NULL,
        "confidence" DOUBLE PRECISION,
        "latencyMs" INTEGER,
        "failureReason" TEXT,
        "conversationId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "workflows" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "triggerType" TEXT NOT NULL DEFAULT 'new_message',
        "steps" TEXT NOT NULL DEFAULT '[]',
        "isActive" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "knowledge_sources" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "sourceType" TEXT NOT NULL,
        "sourceUrl" TEXT,
        "originalFilename" TEXT,
        "contentText" TEXT NOT NULL,
        "processedAt" TIMESTAMP(3),
        "status" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "chunkCount" INTEGER NOT NULL DEFAULT 0,
        "errorMessage" TEXT,
        "fileSize" INTEGER,
        "pageCount" INTEGER,
        "ingestionJobId" TEXT,
    
        CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "ingestion_jobs" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "jobType" TEXT NOT NULL,
        "dedupeKey" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "priority" INTEGER NOT NULL DEFAULT 5,
        "params" TEXT NOT NULL,
        "progress" INTEGER NOT NULL DEFAULT 0,
        "progressMessage" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "startedAt" TIMESTAMP(3),
        "completedAt" TIMESTAMP(3),
        "sourcesCreated" INTEGER NOT NULL DEFAULT 0,
        "chunksCreated" INTEGER NOT NULL DEFAULT 0,
        "errorMessage" TEXT,
        "errorStack" TEXT,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "maxAttempts" INTEGER NOT NULL DEFAULT 3,
        "nextRetryAt" TIMESTAMP(3),
    
        CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "conversations" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "userSessionId" TEXT NOT NULL,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastMessageAt" TIMESTAMP(3),
        "userIntent" TEXT,
        "sentiment" TEXT,
        "isResolved" BOOLEAN NOT NULL DEFAULT false,
        "summary" TEXT,
        "lastSummaryAt" TIMESTAMP(3),
        "userName" TEXT,
        "userEmail" TEXT,
        "userPhone" TEXT,
        "userCompany" TEXT,
        "extractedData" TEXT,
        "topicsDiscussed" TEXT,
        "needsHumanEscalation" BOOLEAN NOT NULL DEFAULT false,
        "escalatedAt" TIMESTAMP(3),
        "escalationReason" TEXT,
        "assignedAgent" TEXT,
    
        CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "messages" (
        "id" TEXT NOT NULL,
        "conversationId" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "sourcesUsed" TEXT,
        "feedback" TEXT,
        "feedbackComment" TEXT,
        "ctaData" TEXT,
        "quickReplies" TEXT,
    
        CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "structured_facts" (
        "id" TEXT NOT NULL,
        "conversationId" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "factType" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "entityType" TEXT,
        "entityName" TEXT,
        "attribute" TEXT,
        "value" TEXT NOT NULL,
        "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        "source" TEXT NOT NULL,
        "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "validUntil" TIMESTAMP(3),
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "supersedes" TEXT,
        "supersededBy" TEXT,
        "embedding" TEXT,
        "embeddingModel" TEXT,
        "intent" TEXT,
        "sentiment" TEXT,
        "importance" INTEGER NOT NULL DEFAULT 5,
        "rawText" TEXT,
        "extractionMethod" TEXT,
        "metadata" TEXT,
    
        CONSTRAINT "structured_facts_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "entities" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "entityType" TEXT NOT NULL,
        "entityName" TEXT NOT NULL,
        "displayName" TEXT,
        "aliases" TEXT,
        "attributes" TEXT,
        "description" TEXT,
        "category" TEXT,
        "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        "extractedFrom" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "embedding" TEXT,
        "embeddingModel" TEXT,
        "metadata" TEXT,
        "tags" TEXT,
    
        CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "relations" (
        "id" TEXT NOT NULL,
        "botId" TEXT NOT NULL,
        "sourceEntityId" TEXT NOT NULL,
        "relationType" TEXT NOT NULL,
        "targetEntityId" TEXT NOT NULL,
        "attributes" TEXT,
        "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        "bidirectional" BOOLEAN NOT NULL DEFAULT false,
        "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        "extractedFrom" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "validUntil" TIMESTAMP(3),
        "metadata" TEXT,
    
        CONSTRAINT "relations_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "events" (
        "id" TEXT NOT NULL,
        "botId" TEXT,
        "conversationId" TEXT,
        "userId" TEXT,
        "jobId" TEXT,
        "eventType" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "severity" TEXT NOT NULL,
        "success" BOOLEAN NOT NULL DEFAULT true,
        "durationMs" INTEGER,
        "errorMessage" TEXT,
        "errorStack" TEXT,
        "metadata" TEXT,
        "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "events_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "embed_settings" (
        "id" TEXT NOT NULL,
        "chatbotId" TEXT NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "title" TEXT,
        "subtitle" TEXT,
        "theme" TEXT NOT NULL DEFAULT 'light',
        "position" TEXT NOT NULL DEFAULT 'bottom-right',
        "primaryColor" TEXT NOT NULL DEFAULT '#007bff',
        "widgetShape" TEXT NOT NULL DEFAULT 'circle',
        "iconType" TEXT NOT NULL DEFAULT 'emoji',
        "iconValue" TEXT NOT NULL DEFAULT '💬',
        "widgetSize" TEXT NOT NULL DEFAULT 'medium',
        "animation" BOOLEAN NOT NULL DEFAULT true,
        "shadow" BOOLEAN NOT NULL DEFAULT true,
        "gradient" BOOLEAN NOT NULL DEFAULT true,
        "autoOpen" BOOLEAN NOT NULL DEFAULT false,
        "showLauncher" BOOLEAN NOT NULL DEFAULT true,
        "customCSS" TEXT,
        "allowedDomains" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "embed_settings_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateIndex
    CREATE INDEX "chatbots_companyName_idx" ON "chatbots"("companyName");
    
    -- CreateIndex
    CREATE INDEX "chatbots_isActive_idx" ON "chatbots"("isActive");
    
    -- CreateIndex
    CREATE INDEX "chatbots_createdAt_idx" ON "chatbots"("createdAt");
    
    -- CreateIndex
    CREATE INDEX "chatbots_promptTemplateId_idx" ON "chatbots"("promptTemplateId");
    
    -- CreateIndex
    CREATE INDEX "chatbots_kbStatus_idx" ON "chatbots"("kbStatus");
    
    -- CreateIndex
    CREATE INDEX "prompt_versions_botId_createdAt_idx" ON "prompt_versions"("botId", "createdAt");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "prompt_versions_botId_version_key" ON "prompt_versions"("botId", "version");
    
    -- CreateIndex
    CREATE INDEX "crm_contacts_botId_stage_idx" ON "crm_contacts"("botId", "stage");
    
    -- CreateIndex
    CREATE INDEX "crm_contacts_email_idx" ON "crm_contacts"("email");
    
    -- CreateIndex
    CREATE INDEX "crm_contacts_phone_idx" ON "crm_contacts"("phone");
    
    -- CreateIndex
    CREATE INDEX "crm_contacts_leadScore_idx" ON "crm_contacts"("leadScore");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "crm_contacts_botId_identityKey_key" ON "crm_contacts"("botId", "identityKey");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "notification_states_key_key" ON "notification_states"("key");
    
    -- CreateIndex
    CREATE INDEX "notification_states_readAt_idx" ON "notification_states"("readAt");
    
    -- CreateIndex
    CREATE INDEX "notification_states_dismissed_idx" ON "notification_states"("dismissed");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "improvement_suggestions_key_key" ON "improvement_suggestions"("key");
    
    -- CreateIndex
    CREATE INDEX "improvement_suggestions_botId_status_idx" ON "improvement_suggestions"("botId", "status");
    
    -- CreateIndex
    CREATE INDEX "improvement_suggestions_category_status_idx" ON "improvement_suggestions"("category", "status");
    
    -- CreateIndex
    CREATE INDEX "improvement_suggestions_impact_idx" ON "improvement_suggestions"("impact");
    
    -- CreateIndex
    CREATE INDEX "agent_actions_botId_enabled_idx" ON "agent_actions"("botId", "enabled");
    
    -- CreateIndex
    CREATE INDEX "agent_actions_type_idx" ON "agent_actions"("type");
    
    -- CreateIndex
    CREATE INDEX "action_executions_actionId_createdAt_idx" ON "action_executions"("actionId", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "action_executions_success_createdAt_idx" ON "action_executions"("success", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "integration_connections_botId_enabled_idx" ON "integration_connections"("botId", "enabled");
    
    -- CreateIndex
    CREATE INDEX "integration_connections_category_idx" ON "integration_connections"("category");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "integration_connections_botId_provider_key" ON "integration_connections"("botId", "provider");
    
    -- CreateIndex
    CREATE INDEX "evaluation_cases_botId_idx" ON "evaluation_cases"("botId");
    
    -- CreateIndex
    CREATE INDEX "evaluation_cases_isActive_idx" ON "evaluation_cases"("isActive");
    
    -- CreateIndex
    CREATE INDEX "evaluation_runs_caseId_createdAt_idx" ON "evaluation_runs"("caseId", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "evaluation_runs_passed_idx" ON "evaluation_runs"("passed");
    
    -- CreateIndex
    CREATE INDEX "workflows_botId_idx" ON "workflows"("botId");
    
    -- CreateIndex
    CREATE INDEX "workflows_isActive_idx" ON "workflows"("isActive");
    
    -- CreateIndex
    CREATE INDEX "knowledge_sources_botId_idx" ON "knowledge_sources"("botId");
    
    -- CreateIndex
    CREATE INDEX "knowledge_sources_status_idx" ON "knowledge_sources"("status");
    
    -- CreateIndex
    CREATE INDEX "knowledge_sources_sourceType_idx" ON "knowledge_sources"("sourceType");
    
    -- CreateIndex
    CREATE INDEX "knowledge_sources_ingestionJobId_idx" ON "knowledge_sources"("ingestionJobId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "ingestion_jobs_dedupeKey_key" ON "ingestion_jobs"("dedupeKey");
    
    -- CreateIndex
    CREATE INDEX "ingestion_jobs_botId_idx" ON "ingestion_jobs"("botId");
    
    -- CreateIndex
    CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs"("status");
    
    -- CreateIndex
    CREATE INDEX "ingestion_jobs_jobType_idx" ON "ingestion_jobs"("jobType");
    
    -- CreateIndex
    CREATE INDEX "ingestion_jobs_priority_idx" ON "ingestion_jobs"("priority");
    
    -- CreateIndex
    CREATE INDEX "ingestion_jobs_createdAt_idx" ON "ingestion_jobs"("createdAt");
    
    -- CreateIndex
    CREATE INDEX "ingestion_jobs_nextRetryAt_idx" ON "ingestion_jobs"("nextRetryAt");
    
    -- CreateIndex
    CREATE INDEX "conversations_botId_idx" ON "conversations"("botId");
    
    -- CreateIndex
    CREATE INDEX "conversations_userSessionId_idx" ON "conversations"("userSessionId");
    
    -- CreateIndex
    CREATE INDEX "conversations_startedAt_idx" ON "conversations"("startedAt");
    
    -- CreateIndex
    CREATE INDEX "conversations_userIntent_idx" ON "conversations"("userIntent");
    
    -- CreateIndex
    CREATE INDEX "conversations_sentiment_idx" ON "conversations"("sentiment");
    
    -- CreateIndex
    CREATE INDEX "conversations_isResolved_idx" ON "conversations"("isResolved");
    
    -- CreateIndex
    CREATE INDEX "conversations_needsHumanEscalation_idx" ON "conversations"("needsHumanEscalation");
    
    -- CreateIndex
    CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");
    
    -- CreateIndex
    CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");
    
    -- CreateIndex
    CREATE INDEX "messages_feedback_idx" ON "messages"("feedback");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_conversationId_idx" ON "structured_facts"("conversationId");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_botId_idx" ON "structured_facts"("botId");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_factType_idx" ON "structured_facts"("factType");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_category_idx" ON "structured_facts"("category");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_entityType_idx" ON "structured_facts"("entityType");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_entityName_idx" ON "structured_facts"("entityName");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_isActive_idx" ON "structured_facts"("isActive");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_extractedAt_idx" ON "structured_facts"("extractedAt");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_confidence_idx" ON "structured_facts"("confidence");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_importance_idx" ON "structured_facts"("importance");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_validFrom_idx" ON "structured_facts"("validFrom");
    
    -- CreateIndex
    CREATE INDEX "structured_facts_validUntil_idx" ON "structured_facts"("validUntil");
    
    -- CreateIndex
    CREATE INDEX "entities_botId_idx" ON "entities"("botId");
    
    -- CreateIndex
    CREATE INDEX "entities_entityType_idx" ON "entities"("entityType");
    
    -- CreateIndex
    CREATE INDEX "entities_entityName_idx" ON "entities"("entityName");
    
    -- CreateIndex
    CREATE INDEX "entities_category_idx" ON "entities"("category");
    
    -- CreateIndex
    CREATE INDEX "entities_isActive_idx" ON "entities"("isActive");
    
    -- CreateIndex
    CREATE INDEX "entities_createdAt_idx" ON "entities"("createdAt");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "entities_botId_entityType_entityName_key" ON "entities"("botId", "entityType", "entityName");
    
    -- CreateIndex
    CREATE INDEX "relations_botId_idx" ON "relations"("botId");
    
    -- CreateIndex
    CREATE INDEX "relations_sourceEntityId_idx" ON "relations"("sourceEntityId");
    
    -- CreateIndex
    CREATE INDEX "relations_targetEntityId_idx" ON "relations"("targetEntityId");
    
    -- CreateIndex
    CREATE INDEX "relations_relationType_idx" ON "relations"("relationType");
    
    -- CreateIndex
    CREATE INDEX "relations_isActive_idx" ON "relations"("isActive");
    
    -- CreateIndex
    CREATE INDEX "relations_validFrom_idx" ON "relations"("validFrom");
    
    -- CreateIndex
    CREATE INDEX "relations_validUntil_idx" ON "relations"("validUntil");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "relations_botId_sourceEntityId_relationType_targetEntityId_key" ON "relations"("botId", "sourceEntityId", "relationType", "targetEntityId");
    
    -- CreateIndex
    CREATE INDEX "events_botId_timestamp_idx" ON "events"("botId", "timestamp");
    
    -- CreateIndex
    CREATE INDEX "events_conversationId_timestamp_idx" ON "events"("conversationId", "timestamp");
    
    -- CreateIndex
    CREATE INDEX "events_jobId_timestamp_idx" ON "events"("jobId", "timestamp");
    
    -- CreateIndex
    CREATE INDEX "events_eventType_timestamp_idx" ON "events"("eventType", "timestamp");
    
    -- CreateIndex
    CREATE INDEX "events_category_timestamp_idx" ON "events"("category", "timestamp");
    
    -- CreateIndex
    CREATE INDEX "events_severity_timestamp_idx" ON "events"("severity", "timestamp");
    
    -- CreateIndex
    CREATE INDEX "events_success_timestamp_idx" ON "events"("success", "timestamp");
    
    -- CreateIndex
    CREATE INDEX "events_timestamp_idx" ON "events"("timestamp");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "embed_settings_chatbotId_key" ON "embed_settings"("chatbotId");
    
    -- AddForeignKey
    ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "improvement_suggestions" ADD CONSTRAINT "improvement_suggestions_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "agent_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "evaluation_cases" ADD CONSTRAINT "evaluation_cases_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "evaluation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "workflows" ADD CONSTRAINT "workflows_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "structured_facts" ADD CONSTRAINT "structured_facts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "structured_facts" ADD CONSTRAINT "structured_facts_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "entities" ADD CONSTRAINT "entities_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "relations" ADD CONSTRAINT "relations_sourceEntityId_fkey" FOREIGN KEY ("sourceEntityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "relations" ADD CONSTRAINT "relations_targetEntityId_fkey" FOREIGN KEY ("targetEntityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "relations" ADD CONSTRAINT "relations_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "events" ADD CONSTRAINT "events_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "events" ADD CONSTRAINT "events_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "events" ADD CONSTRAINT "events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ingestion_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "embed_settings" ADD CONSTRAINT "embed_settings_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$litx_baseline$;

