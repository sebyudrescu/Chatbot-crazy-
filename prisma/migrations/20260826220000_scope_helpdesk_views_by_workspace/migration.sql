ALTER TABLE "helpdesk_saved_views" ADD COLUMN "workspaceId" TEXT;

UPDATE "helpdesk_saved_views"
SET "workspaceId" = '00000000-0000-4000-8000-000000000001'
WHERE "workspaceId" IS NULL;

ALTER TABLE "helpdesk_saved_views" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "helpdesk_saved_views" DROP CONSTRAINT IF EXISTS "helpdesk_saved_views_name_key";
ALTER TABLE "helpdesk_saved_views"
  ADD CONSTRAINT "helpdesk_saved_views_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "helpdesk_saved_views_workspaceId_name_key"
  ON "helpdesk_saved_views"("workspaceId", "name");
CREATE INDEX "helpdesk_saved_views_workspaceId_isDefault_updatedAt_idx"
  ON "helpdesk_saved_views"("workspaceId", "isDefault", "updatedAt");
