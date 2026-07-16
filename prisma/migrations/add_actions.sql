CREATE TABLE IF NOT EXISTS "agent_actions" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT,
  "triggerKeywords" TEXT NOT NULL DEFAULT '[]',
  "config" TEXT NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_actions_botId_fkey" FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "agent_actions_botId_enabled_idx" ON "agent_actions"("botId", "enabled");
CREATE INDEX IF NOT EXISTS "agent_actions_type_idx" ON "agent_actions"("type");

CREATE TABLE IF NOT EXISTS "action_executions" (
  "id" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "conversationId" TEXT,
  "success" BOOLEAN NOT NULL,
  "input" TEXT,
  "output" TEXT,
  "error" TEXT,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "action_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "action_executions_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "agent_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "action_executions_actionId_createdAt_idx" ON "action_executions"("actionId", "createdAt");
CREATE INDEX IF NOT EXISTS "action_executions_success_createdAt_idx" ON "action_executions"("success", "createdAt");
