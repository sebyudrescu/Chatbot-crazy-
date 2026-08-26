import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOwnerSessionToken } from "@/lib/auth-token";
import {
  allowedWorkspaceIds,
  actorCanAccessWorkspace,
  isWorkspaceRole,
  roleHasPermission,
  type DashboardActor,
  type WorkspacePermission,
  type WorkspaceRole,
} from "@/lib/workspace-permissions";

export {
  actorCanAccessWorkspace,
  allowedWorkspaceIds,
  isWorkspaceRole,
  roleHasPermission,
  workspaceWhere,
} from "@/lib/workspace-permissions";
export type {
  DashboardActor,
  WorkspaceGrant,
  WorkspacePermission,
  WorkspaceRole,
} from "@/lib/workspace-permissions";

export const DEFAULT_AGENCY_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
export const USER_SESSION_COOKIE = "litx_user_session";
export const USER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export class DashboardAuthError extends Error {
  constructor(message: string, public readonly status: 401 | 403 | 404) {
    super(message);
  }
}

function userSessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueUserSession(userId: string, now = new Date()) {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(now.getTime() + USER_SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.userSession.create({
    data: { userId, tokenHash: userSessionHash(token), expiresAt, lastUsedAt: now },
  });
  return { token, expiresAt };
}

export async function revokeUserSession(token: string) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return false;
  const result = await prisma.userSession.updateMany({
    where: { tokenHash: userSessionHash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

export async function authenticateDashboardRequest(request: NextRequest): Promise<DashboardActor | null> {
  const ownerPassword = process.env.APP_ACCESS_PASSWORD;
  const ownerSalt = process.env.APP_AUTH_SALT || "litx-private-owner";
  if (ownerPassword && await verifyOwnerSessionToken(request.cookies.get("litx_owner")?.value, ownerPassword, ownerSalt)) {
    return { kind: "legacy_owner", userId: null, grants: null };
  }
  if (!ownerPassword && process.env.NODE_ENV !== "production") {
    return { kind: "legacy_owner", userId: null, grants: null };
  }

  const token = request.cookies.get(USER_SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) return null;
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: userSessionHash(token) },
    include: {
      user: {
        include: { memberships: { where: { status: "active" }, select: { workspaceId: true, role: true } } },
      },
    },
  });
  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt <= now || session.user.status !== "active") return null;
  if (now.getTime() - session.lastUsedAt.getTime() > 5 * 60_000) {
    void prisma.userSession.update({ where: { id: session.id }, data: { lastUsedAt: now } }).catch(() => undefined);
  }
  return {
    kind: "user",
    userId: session.userId,
    grants: session.user.memberships
      .filter((membership): membership is { workspaceId: string; role: WorkspaceRole } => isWorkspaceRole(membership.role))
      .map((membership) => ({ workspaceId: membership.workspaceId, role: membership.role })),
  };
}

export async function requireDashboardActor(request: NextRequest) {
  const actor = await authenticateDashboardRequest(request);
  if (!actor) throw new DashboardAuthError("Accesso non autorizzato", 401);
  return actor;
}

export async function requireBotPermission(
  actor: DashboardActor,
  botId: string,
  permission: WorkspacePermission,
) {
  const bot = await prisma.chatbot.findUnique({ where: { id: botId }, select: { id: true, workspaceId: true } });
  if (!bot || !actorCanAccessWorkspace(actor, bot.workspaceId, permission)) {
    throw new DashboardAuthError("Risorsa non trovata", 404);
  }
  return bot;
}

export async function accessibleBotIds(actor: DashboardActor, permission: WorkspacePermission) {
  const workspaceIds = allowedWorkspaceIds(actor, permission);
  if (workspaceIds === null) return null;
  return (await prisma.chatbot.findMany({
    where: { workspaceId: { in: workspaceIds } },
    select: { id: true },
  })).map((bot) => bot.id);
}

export async function workspaceForNewChatbot(actor: DashboardActor, requestedWorkspaceId?: string) {
  if (actor.kind === "legacy_owner") {
    const workspaceId = requestedWorkspaceId || DEFAULT_AGENCY_WORKSPACE_ID;
    const exists = await prisma.workspace.count({ where: { id: workspaceId } });
    if (!exists) throw new DashboardAuthError("Workspace non trovato", 404);
    return workspaceId;
  }
  const writable = actor.grants.filter((grant) => roleHasPermission(grant.role, "chatbot.write"));
  const workspaceId = requestedWorkspaceId || (writable.length === 1 ? writable[0].workspaceId : undefined);
  if (!workspaceId || !actorCanAccessWorkspace(actor, workspaceId, "chatbot.write")) {
    throw new DashboardAuthError("Permessi insufficienti", 403);
  }
  return workspaceId;
}

export function dashboardAuthErrorResponse(error: unknown) {
  if (error instanceof DashboardAuthError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return null;
}
