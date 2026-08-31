"use client";

import { useEffect, useMemo, useState } from "react";

type Role = "owner" | "admin" | "operator" | "viewer";
type Permission = "configure" | "conversations.write" | "billing.manage";
type Account = { mode: "owner"; displayName: string } | { mode: "client"; memberships: Array<{ role: Role; workspace: { id: string } }> };

export function useDashboardPermissions() {
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => { void fetch("/api/auth/me", { cache: "no-store" }).then(response => response.json()).then(result => setAccount(result.success ? result.data : null)).catch(() => setAccount(null)); }, []);
  return useMemo(() => ({
    loaded: account !== null,
    can(workspaceId: string | undefined, permission: Permission) {
      if (account?.mode === "owner") return true;
      if (!workspaceId || account?.mode !== "client") return false;
      const role = account.memberships.find(item => item.workspace.id === workspaceId)?.role;
      if (permission === "billing.manage") return role === "owner";
      if (permission === "configure") return role === "owner" || role === "admin";
      return role === "owner" || role === "admin" || role === "operator";
    },
  }), [account]);
}
