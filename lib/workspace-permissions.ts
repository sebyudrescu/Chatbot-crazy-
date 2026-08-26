export type WorkspaceRole = "owner" | "admin" | "operator" | "viewer";

export type WorkspacePermission =
  | "workspace.read"
  | "members.manage"
  | "chatbot.read"
  | "chatbot.write"
  | "conversation.read"
  | "conversation.write"
  | "analytics.read"
  | "knowledge.write"
  | "billing.manage";

const rolePermissions: Record<WorkspaceRole, ReadonlySet<WorkspacePermission>> = {
  owner: new Set([
    "workspace.read", "members.manage", "chatbot.read", "chatbot.write",
    "conversation.read", "conversation.write", "analytics.read", "knowledge.write", "billing.manage",
  ]),
  admin: new Set([
    "workspace.read", "members.manage", "chatbot.read", "chatbot.write",
    "conversation.read", "conversation.write", "analytics.read", "knowledge.write",
  ]),
  operator: new Set([
    "workspace.read", "chatbot.read", "conversation.read", "conversation.write", "analytics.read",
  ]),
  viewer: new Set(["workspace.read", "chatbot.read", "conversation.read", "analytics.read"]),
};

export interface WorkspaceGrant {
  workspaceId: string;
  role: WorkspaceRole;
}

export type DashboardActor =
  | { kind: "legacy_owner"; userId: null; grants: null }
  | { kind: "user"; userId: string; grants: WorkspaceGrant[] };

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return value === "owner" || value === "admin" || value === "operator" || value === "viewer";
}

export function roleHasPermission(role: WorkspaceRole, permission: WorkspacePermission) {
  return rolePermissions[role].has(permission);
}

export function actorCanAccessWorkspace(
  actor: DashboardActor,
  workspaceId: string,
  permission: WorkspacePermission,
) {
  if (actor.kind === "legacy_owner") return true;
  return actor.grants.some((grant) => grant.workspaceId === workspaceId && roleHasPermission(grant.role, permission));
}

export function allowedWorkspaceIds(actor: DashboardActor, permission: WorkspacePermission): string[] | null {
  if (actor.kind === "legacy_owner") return null;
  return actor.grants
    .filter((grant) => roleHasPermission(grant.role, permission))
    .map((grant) => grant.workspaceId);
}

export function workspaceWhere(actor: DashboardActor, permission: WorkspacePermission) {
  const ids = allowedWorkspaceIds(actor, permission);
  return ids === null ? {} : { workspaceId: { in: ids } };
}
