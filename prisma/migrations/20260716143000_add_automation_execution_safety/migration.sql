ALTER TABLE "action_executions"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "action_executions_idempotencyKey_key"
ON "action_executions"("idempotencyKey");

CREATE TABLE "workflow_executions" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "conversationId" TEXT,
  "messageId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "actions" TEXT NOT NULL DEFAULT '[]',
  "error" TEXT,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workflow_executions"
ADD CONSTRAINT "workflow_executions_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "workflow_executions_idempotencyKey_key"
ON "workflow_executions"("idempotencyKey");

CREATE INDEX "workflow_executions_workflowId_createdAt_idx"
ON "workflow_executions"("workflowId", "createdAt");

CREATE INDEX "workflow_executions_conversationId_createdAt_idx"
ON "workflow_executions"("conversationId", "createdAt");

CREATE INDEX "workflow_executions_status_createdAt_idx"
ON "workflow_executions"("status", "createdAt");
