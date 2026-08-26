CREATE TABLE "workspace_audit_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_audit_logs_workspaceId_createdAt_idx" ON "workspace_audit_logs"("workspaceId", "createdAt");
CREATE INDEX "workspace_audit_logs_actorUserId_createdAt_idx" ON "workspace_audit_logs"("actorUserId", "createdAt");
CREATE INDEX "workspace_audit_logs_action_createdAt_idx" ON "workspace_audit_logs"("action", "createdAt");

ALTER TABLE "workspace_audit_logs"
ADD CONSTRAINT "workspace_audit_logs_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_audit_logs"
ADD CONSTRAINT "workspace_audit_logs_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
