CREATE TABLE "widget_versions" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" TEXT NOT NULL,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "widget_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "widget_versions_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "agent_actions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "widget_versions_actionId_version_key" ON "widget_versions"("actionId", "version");
CREATE INDEX "widget_versions_actionId_createdAt_idx" ON "widget_versions"("actionId", "createdAt");
