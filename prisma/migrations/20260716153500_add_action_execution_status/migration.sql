ALTER TABLE "action_executions"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';

UPDATE "action_executions"
SET "status" = CASE
  WHEN "success" = TRUE THEN 'success'
  ELSE 'failed'
END;

CREATE INDEX "action_executions_status_createdAt_idx"
ON "action_executions"("status", "createdAt");
