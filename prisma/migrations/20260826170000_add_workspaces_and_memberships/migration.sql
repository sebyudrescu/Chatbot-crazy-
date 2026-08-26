CREATE TABLE "workspaces" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'client',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspaces_kind_check" CHECK ("kind" IN ('agency', 'client'))
);

CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");
CREATE INDEX "workspaces_kind_idx" ON "workspaces"("kind");
CREATE INDEX "workspaces_createdAt_idx" ON "workspaces"("createdAt");

INSERT INTO "workspaces" ("id", "name", "slug", "kind", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'LitX Agency', 'litx-agency', 'agency', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "chatbots" ADD COLUMN "workspaceId" TEXT;
UPDATE "chatbots"
SET "workspaceId" = '00000000-0000-4000-8000-000000000001'
WHERE "workspaceId" IS NULL;
ALTER TABLE "chatbots" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "chatbots"
  ADD CONSTRAINT "chatbots_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "chatbots_workspaceId_createdAt_idx" ON "chatbots"("workspaceId", "createdAt");
CREATE INDEX "chatbots_workspaceId_isActive_idx" ON "chatbots"("workspaceId", "isActive");

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_status_check" CHECK ("status" IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

CREATE TABLE "workspace_memberships" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'viewer',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_memberships_role_check" CHECK ("role" IN ('owner', 'admin', 'operator', 'viewer')),
  CONSTRAINT "workspace_memberships_status_check" CHECK ("status" IN ('active', 'suspended')),
  CONSTRAINT "workspace_memberships_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workspace_memberships_workspaceId_userId_key" ON "workspace_memberships"("workspaceId", "userId");
CREATE INDEX "workspace_memberships_userId_status_idx" ON "workspace_memberships"("userId", "status");
CREATE INDEX "workspace_memberships_workspaceId_role_idx" ON "workspace_memberships"("workspaceId", "role");

CREATE TABLE "user_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions"("tokenHash");
CREATE INDEX "user_sessions_userId_expiresAt_idx" ON "user_sessions"("userId", "expiresAt");
CREATE INDEX "user_sessions_expiresAt_revokedAt_idx" ON "user_sessions"("expiresAt", "revokedAt");
