"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  BookOpen,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquareText,
  PlayCircle,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WeeklyReportPanel } from "@/components/WeeklyReportPanel";

type WorkspaceRole = "owner" | "admin" | "operator" | "viewer";
type Account = {
  mode: "client";
  displayName: string;
  email: string;
  memberships: Array<{
    role: WorkspaceRole;
    workspace: { id: string; name: string; slug: string };
  }>;
};
type Agent = {
  id: string;
  workspaceId: string;
  companyName: string;
  isActive: boolean;
  kbStatus: string;
  _count: { conversations: number; knowledgeSources: number };
};
type Analytics = {
  conversations: number;
  messages: number;
  leads: number;
  attention: number;
};
type Member = {
  id: string;
  role: WorkspaceRole;
  status: "active" | "suspended";
  user: { id: string; displayName: string; email: string; status: string };
};
type Invitation = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
type AuditEntry = {
  id: string;
  action: string;
  targetType: string;
  createdAt: string;
  actor: { displayName: string; email: string } | null;
};

export default function ClientPortalPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({
    conversations: 0,
    messages: 0,
    leads: 0,
    attention: 0,
  });
  const [error, setError] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamMessage, setTeamMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("viewer");
  const [latestInviteUrl, setLatestInviteUrl] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me"),
      fetch("/api/chatbots"),
      fetch("/api/analytics?days=30"),
    ])
      .then(async (responses) =>
        Promise.all(
          responses.map(async (response) => ({
            ok: response.ok,
            body: await response.json(),
          })),
        ),
      )
      .then(([me, bots, stats]) => {
        if (!me.ok || me.body.data?.mode !== "client")
          throw new Error("Sessione cliente non valida");
        if (!bots.ok || !bots.body.success || !stats.ok || !stats.body.success || !stats.body.data?.summary)
          throw new Error("Non è stato possibile caricare il portale");
        const nextAccount = me.body.data as Account;
        setAccount(nextAccount);
        setAgents(bots.body.data || []);
        const manageable = nextAccount.memberships.find(
          (membership) =>
            membership.role === "owner" || membership.role === "admin",
        );
        setSelectedWorkspaceId(manageable?.workspace.id || "");
        setAnalytics({
          conversations: stats.body.data?.summary?.conversations ?? 0,
          messages: stats.body.data?.summary?.messages ?? 0,
          leads: stats.body.data?.summary?.identifiedContacts ?? 0,
          attention: stats.body.data?.helpdesk?.backlog ?? 0,
        });
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Portale non disponibile",
        ),
      );
  }, []);

  const loadTeam = useCallback(
    async (workspaceId: string, preserveMessage = false) => {
      if (!workspaceId) return;
      setTeamBusy(true);
      if (!preserveMessage) setTeamMessage("");
      try {
        const [membersResponse, invitationsResponse, auditResponse] =
          await Promise.all([
            fetch(`/api/workspaces/${workspaceId}/members`),
            fetch(`/api/workspaces/${workspaceId}/invitations`),
            fetch(`/api/workspaces/${workspaceId}/audit`),
          ]);
        const [membersBody, invitationsBody, auditBody] = await Promise.all([
          membersResponse.json(),
          invitationsResponse.json(),
          auditResponse.json(),
        ]);
        if (!membersResponse.ok || !invitationsResponse.ok || !auditResponse.ok)
          throw new Error(
            membersBody.error ||
              invitationsBody.error ||
              auditBody.error ||
              "Team non disponibile",
          );
        setMembers(membersBody.data || []);
        setInvitations(invitationsBody.data || []);
        setAuditEntries(auditBody.data || []);
      } catch (reason) {
        setTeamMessage(
          reason instanceof Error ? reason.message : "Team non disponibile",
        );
      } finally {
        setTeamBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedWorkspaceId) void loadTeam(selectedWorkspaceId);
  }, [loadTeam, selectedWorkspaceId]);

  const inviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedWorkspaceId || !inviteEmail.trim()) return;
    setTeamBusy(true);
    setTeamMessage("");
    setLatestInviteUrl("");
    try {
      const response = await fetch(
        `/api/workspaces/${selectedWorkspaceId}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: inviteEmail,
            role: inviteRole,
            expiresInHours: 72,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Invito non riuscito");
      setInviteEmail("");
      setLatestInviteUrl(body.data.acceptUrl);
      setTeamMessage(
        body.data.emailSent
          ? "Invito inviato via email. Il link resta disponibile come copia di sicurezza."
          : "Invito creato, ma l’email non è partita. Condividi il link tramite un canale sicuro.",
      );
      await loadTeam(selectedWorkspaceId, true);
    } catch (reason) {
      setTeamMessage(
        reason instanceof Error ? reason.message : "Invito non riuscito",
      );
    } finally {
      setTeamBusy(false);
    }
  };

  const updateMember = async (
    membershipId: string,
    update: Partial<Pick<Member, "role" | "status">>,
  ) => {
    if (!selectedWorkspaceId) return;
    setTeamBusy(true);
    setTeamMessage("");
    try {
      const response = await fetch(
        `/api/workspaces/${selectedWorkspaceId}/members/${membershipId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Modifica non riuscita");
      setTeamMessage("Accesso aggiornato.");
      await loadTeam(selectedWorkspaceId, true);
    } catch (reason) {
      setTeamMessage(
        reason instanceof Error ? reason.message : "Modifica non riuscita",
      );
    } finally {
      setTeamBusy(false);
    }
  };

  const removeMember = async (membershipId: string) => {
    if (
      !selectedWorkspaceId ||
      !window.confirm("Rimuovere questo membro dal workspace?")
    )
      return;
    setTeamBusy(true);
    setTeamMessage("");
    try {
      const response = await fetch(
        `/api/workspaces/${selectedWorkspaceId}/members/${membershipId}`,
        { method: "DELETE" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Rimozione non riuscita");
      setTeamMessage("Membro rimosso.");
      await loadTeam(selectedWorkspaceId, true);
    } catch (reason) {
      setTeamMessage(
        reason instanceof Error ? reason.message : "Rimozione non riuscita",
      );
    } finally {
      setTeamBusy(false);
    }
  };

  const revokeInvitation = async (invitationId: string) => {
    if (!selectedWorkspaceId) return;
    setTeamBusy(true);
    setTeamMessage("");
    try {
      const response = await fetch(
        `/api/workspaces/${selectedWorkspaceId}/invitations/${invitationId}`,
        { method: "DELETE" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Revoca non riuscita");
      setTeamMessage("Invito revocato.");
      await loadTeam(selectedWorkspaceId, true);
    } catch (reason) {
      setTeamMessage(
        reason instanceof Error ? reason.message : "Revoca non riuscita",
      );
    } finally {
      setTeamBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };
  const manageableMemberships = useMemo(
    () =>
      account?.memberships.filter(
        (membership) =>
          membership.role === "owner" || membership.role === "admin",
      ) || [],
    [account],
  );
  const selectedRole = manageableMemberships.find(
    (membership) => membership.workspace.id === selectedWorkspaceId,
  )?.role;
  const primaryAgent = agents[0];
  const pendingInvitations = invitations.filter(
    (invitation) =>
      !invitation.acceptedAt &&
      !invitation.revokedAt &&
      new Date(invitation.expiresAt) >= new Date(),
  );
  const pastInvitations = invitations.filter(
    (invitation) =>
      !invitation.acceptedAt &&
      (Boolean(invitation.revokedAt) ||
        new Date(invitation.expiresAt) < new Date()),
  );

  if (!account && !error)
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </main>
    );
  if (error)
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm rounded-2xl border border-red-200 bg-white p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <Button className="mt-4" onClick={() => router.replace("/login")}>
            Torna all’accesso
          </Button>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-gray-950">LitX AI</p>
              <p className="text-[10px] uppercase tracking-widest text-gray-400">
                Area cliente
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/account/security"
              aria-label="Sicurezza account"
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">Sicurezza</span>
            </Link>
            <Button
              variant="secondary"
              onClick={logout}
              icon={<LogOut className="h-4 w-4" />}
            >
              Esci
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-gray-500">
              Bentornato, {account!.displayName}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-gray-950 sm:text-3xl">
              Il tuo chatbot, sotto controllo
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Leggi le conversazioni e controlla i risultati del chatbot della
              tua azienda.
            </p>
          </div>
          <div className="flex w-fit items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Dati protetti e separati
          </div>
        </div>

        {primaryAgent && <WeeklyReportPanel key={primaryAgent.id} botId={primaryAgent.id} botName={primaryAgent.companyName} />}
        {primaryAgent ? (
          <section className="mt-6 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-gray-950">
                      {primaryAgent.companyName}
                    </h2>
                    <StatusBadge active={primaryAgent.isActive} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {knowledgeStatusLabel(
                      primaryAgent.kbStatus,
                      primaryAgent._count.knowledgeSources,
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <PrimaryAction
                  href={`/chat/${primaryAgent.id}`}
                  icon={<PlayCircle className="h-4 w-4" />}
                  label="Anteprima chatbot"
                  primary
                />
                <PrimaryAction
                  href={`/conversations?botId=${primaryAgent.id}`}
                  icon={<MessageSquareText className="h-4 w-4" />}
                  label="Conversazioni"
                />
                <PrimaryAction
                  href={`/analytics?botId=${primaryAgent.id}`}
                  icon={<BarChart3 className="h-4 w-4" />}
                  label="Risultati"
                />
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <h2 className="font-bold text-gray-900">
              Nessun chatbot assegnato
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Contatta LitX per completare l’assegnazione al tuo account.
            </p>
          </section>
        )}

        <section aria-labelledby="period-summary" className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="period-summary" className="font-bold text-gray-950">
                Ultimi 30 giorni
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Attività registrata dal chatbot nel periodo selezionato.
              </p>
            </div>
            <Link
              href={
                primaryAgent
                  ? `/analytics?botId=${primaryAgent.id}`
                  : "/analytics"
              }
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              Vedi tutti i risultati
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              icon={<MessageSquareText />}
              label="Conversazioni"
              value={analytics.conversations}
              help="Chat iniziate dai visitatori"
            />
            <Metric
              icon={<BarChart3 />}
              label="Messaggi"
              value={analytics.messages}
              help="Messaggi scambiati"
            />
            <Metric
              icon={<Users />}
              label="Contatti riconoscibili"
              value={analytics.leads}
              help="Visitatori con un recapito"
            />
            <Metric
              icon={<UserPlus />}
              label="Da gestire"
              value={analytics.attention}
              help="Richieste di assistenza aperte"
              attention={analytics.attention > 0}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-gray-950">I tuoi chatbot</h2>
          <p className="mt-1 text-xs text-gray-500">
            Accesso in sola lettura. Configurazione e aggiornamenti sono gestiti dall’agenzia.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {agents.map((agent) => {
              const role = account!.memberships.find(
                (membership) => membership.workspace.id === agent.workspaceId,
              )?.role;
              const canConfigure = role === "owner" || role === "admin";
              return (
                <article
                  key={agent.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-950">
                        {agent.companyName}
                      </h3>
                      <p className="mt-1 text-xs text-gray-500">
                        {knowledgeStatusLabel(
                          agent.kbStatus,
                          agent._count.knowledgeSources,
                        )}
                      </p>
                    </div>
                    <StatusBadge active={agent.isActive} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <PortalLink
                      href={`/analytics?botId=${agent.id}`}
                      icon={<BarChart3 />}
                      label="Risultati"
                      description="Utilizzo e risultati"
                    />
                    <PortalLink
                      href={`/conversations?botId=${agent.id}`}
                      icon={<MessageSquareText />}
                      label="Conversazioni"
                      description="Consulta le chat"
                    />
                    {canConfigure ? (
                      <PortalLink
                        href={`/knowledge?botId=${agent.id}`}
                        icon={<BookOpen />}
                        label="Informazioni"
                        description="Cosa conosce"
                      />
                    ) : null}
                    {canConfigure ? (
                      <PortalLink
                        href={`/chatbot/${agent.id}/settings`}
                        icon={<Settings />}
                        label="Impostazioni"
                        description="Risposte e stile"
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {manageableMemberships.length > 0 ? (
          <details className="group mt-10 rounded-2xl border border-gray-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 marker:content-none">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-950">Team e accessi</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Invita collaboratori e scegli cosa possono fare.
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-brand-700 group-open:hidden">
                Gestisci
              </span>
              <span className="hidden text-xs font-semibold text-gray-500 group-open:inline">
                Chiudi
              </span>
            </summary>
            <div className="border-t border-gray-100 p-5 sm:p-6">
              {manageableMemberships.length > 1 ? (
                <label className="text-xs font-semibold text-gray-600">
                  Azienda
                  <select
                    value={selectedWorkspaceId}
                    onChange={(event) =>
                      setSelectedWorkspaceId(event.target.value)
                    }
                    className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    {manageableMemberships.map((membership) => (
                      <option
                        key={membership.workspace.id}
                        value={membership.workspace.id}
                      >
                        {membership.workspace.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <form
                onSubmit={inviteMember}
                className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-4 md:grid-cols-[1fr_220px_auto]"
              >
                <Input
                  type="email"
                  label="Email del collaboratore"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="nome@azienda.it"
                  required
                />
                <label className="text-sm font-medium text-gray-700">
                  Permessi
                  <select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.target.value as WorkspaceRole)
                    }
                    className="input mt-1"
                  >
                    <option value="viewer">Può solo vedere</option>
                    <option value="operator">Può rispondere alle chat</option>
                    <option value="admin">Può anche configurare</option>
                    {selectedRole === "owner" ? (
                      <option value="owner">Proprietario completo</option>
                    ) : null}
                  </select>
                </label>
                <Button
                  type="submit"
                  className="self-end"
                  loading={teamBusy}
                  icon={<UserPlus className="h-4 w-4" />}
                >
                  Invita
                </Button>
              </form>
              {teamMessage ? (
                <p
                  className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700"
                  role="status"
                >
                  {teamMessage}
                </p>
              ) : null}
              {latestInviteUrl ? (
                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 truncate text-xs text-amber-950">
                    {latestInviteUrl}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<Copy className="h-4 w-4" />}
                    onClick={() =>
                      void navigator.clipboard.writeText(latestInviteUrl)
                    }
                  >
                    Copia link
                  </Button>
                </div>
              ) : null}
              <div className="mt-6 space-y-3 sm:hidden">
                {members.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    selectedRole={selectedRole}
                    busy={teamBusy}
                    onUpdate={updateMember}
                    onRemove={removeMember}
                  />
                ))}
              </div>
              <div className="mt-6 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                      <th className="pb-3">Persona</th>
                      <th className="pb-3">Permessi</th>
                      <th className="pb-3">Stato</th>
                      <th className="pb-3 text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        selectedRole={selectedRole}
                        busy={teamBusy}
                        onUpdate={updateMember}
                        onRemove={removeMember}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {teamBusy && members.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Caricamento team…
                </div>
              ) : null}
              <div className="mt-7">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">
                    Inviti in attesa
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadTeam(selectedWorkspaceId)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Aggiorna team"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {pendingInvitations.map((invitation) => (
                    <InvitationItem
                      key={invitation.id}
                      invitation={invitation}
                      busy={teamBusy}
                      onRevoke={revokeInvitation}
                    />
                  ))}
                  {pendingInvitations.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
                      Nessun invito in attesa.
                    </p>
                  ) : null}
                </div>
              </div>
              {pastInvitations.length > 0 ? (
                <details className="mt-5 rounded-xl border border-gray-100">
                  <summary className="cursor-pointer px-3 py-3 text-xs font-semibold text-gray-600">
                    Storico inviti ({pastInvitations.length})
                  </summary>
                  <div className="space-y-2 border-t border-gray-100 p-3">
                    {pastInvitations.map((invitation) => (
                      <InvitationItem
                        key={invitation.id}
                        invitation={invitation}
                        busy={teamBusy}
                        onRevoke={revokeInvitation}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
              <details className="mt-5 rounded-xl border border-gray-100">
                <summary className="cursor-pointer px-3 py-3 text-xs font-semibold text-gray-600">
                  Attività di sicurezza
                </summary>
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {auditEntries.slice(0, 8).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-xs font-semibold text-gray-800">
                          {auditActionLabel(entry.action)}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {entry.actor?.displayName || "LitX"} ·{" "}
                          {targetTypeLabel(entry.targetType)}
                        </p>
                      </div>
                      <time
                        className="text-[10px] text-gray-400"
                        dateTime={entry.createdAt}
                      >
                        {new Date(entry.createdAt).toLocaleString("it-IT")}
                      </time>
                    </div>
                  ))}
                  {auditEntries.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-gray-500">
                      Nessuna attività registrata.
                    </p>
                  ) : null}
                </div>
              </details>
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
    >
      {active ? "Online" : "Non pubblicato"}
    </span>
  );
}
function Metric({
  icon,
  label,
  value,
  help,
  attention = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  help: string;
  attention?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${attention ? "border-amber-200" : "border-gray-200"}`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${attention ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600"}`}
      >
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-950">
        {value.toLocaleString("it-IT")}
      </p>
      <p className="mt-1 text-xs font-semibold text-gray-700">{label}</p>
      <p className="mt-1 hidden text-[10px] text-gray-400 sm:block">{help}</p>
    </div>
  );
}
function PrimaryAction({
  href,
  icon,
  label,
  primary = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition ${primary ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-gray-200 bg-white text-gray-700 hover:border-brand-200 hover:bg-brand-50"}`}
    >
      {icon}
      {label}
    </Link>
  );
}
function PortalLink({
  href,
  icon,
  label,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 p-3 transition hover:border-brand-200 hover:bg-brand-50"
    >
      <span className="flex items-center gap-2 text-xs font-semibold text-gray-800">
        <span className="text-brand-600">{icon}</span>
        {label}
      </span>
      <span className="mt-1 block pl-6 text-[10px] text-gray-400">
        {description}
      </span>
    </Link>
  );
}
function RoleSelect({
  member,
  selectedRole,
  busy,
  onUpdate,
}: {
  member: Member;
  selectedRole?: WorkspaceRole;
  busy: boolean;
  onUpdate: (
    id: string,
    update: Partial<Pick<Member, "role" | "status">>,
  ) => Promise<void>;
}) {
  return (
    <select
      aria-label={`Permessi di ${member.user.displayName}`}
      value={member.role}
      onChange={(event) =>
        void onUpdate(member.id, { role: event.target.value as WorkspaceRole })
      }
      disabled={busy || (member.role === "owner" && selectedRole !== "owner")}
      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
    >
      <option value="viewer">Solo lettura</option>
      <option value="operator">Risponde alle chat</option>
      <option value="admin">Amministra</option>
      {selectedRole === "owner" ? (
        <option value="owner">Proprietario</option>
      ) : null}
    </select>
  );
}

function MemberRow({
  member,
  selectedRole,
  busy,
  onUpdate,
  onRemove,
}: {
  member: Member;
  selectedRole?: WorkspaceRole;
  busy: boolean;
  onUpdate: (
    id: string,
    update: Partial<Pick<Member, "role" | "status">>,
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const protectedOwner = member.role === "owner" && selectedRole !== "owner";
  return (
    <tr className="border-b border-gray-100">
      <td className="py-3">
        <p className="font-semibold text-gray-900">{member.user.displayName}</p>
        <p className="text-xs text-gray-500">{member.user.email}</p>
      </td>
      <td className="py-3">
        <RoleSelect
          member={member}
          selectedRole={selectedRole}
          busy={busy}
          onUpdate={onUpdate}
        />
      </td>
      <td className="py-3">
        <button
          type="button"
          disabled={busy || protectedOwner}
          onClick={() =>
            void onUpdate(member.id, {
              status: member.status === "active" ? "suspended" : "active",
            })
          }
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${member.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
        >
          {member.status === "active" ? "Attivo" : "Sospeso"}
        </button>
      </td>
      <td className="py-3 text-right">
        <button
          type="button"
          disabled={busy || protectedOwner}
          onClick={() => void onRemove(member.id)}
          className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          aria-label={`Rimuovi ${member.user.displayName}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
function MemberCard({
  member,
  selectedRole,
  busy,
  onUpdate,
  onRemove,
}: {
  member: Member;
  selectedRole?: WorkspaceRole;
  busy: boolean;
  onUpdate: (
    id: string,
    update: Partial<Pick<Member, "role" | "status">>,
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const protectedOwner = member.role === "owner" && selectedRole !== "owner";
  return (
    <article className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {member.user.displayName}
          </p>
          <p className="truncate text-xs text-gray-500">{member.user.email}</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold ${member.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
        >
          {member.status === "active" ? "Attivo" : "Sospeso"}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <RoleSelect
          member={member}
          selectedRole={selectedRole}
          busy={busy}
          onUpdate={onUpdate}
        />
        <button
          type="button"
          disabled={busy || protectedOwner}
          onClick={() => void onRemove(member.id)}
          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          aria-label={`Rimuovi ${member.user.displayName}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
function InvitationItem({
  invitation,
  busy,
  onRevoke,
}: {
  invitation: Invitation;
  busy: boolean;
  onRevoke: (id: string) => Promise<void>;
}) {
  const expired = new Date(invitation.expiresAt) < new Date();
  const status = invitation.revokedAt
    ? "Revocato"
    : expired
      ? "Scaduto"
      : "In attesa";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">
          {invitation.email}
        </p>
        <p className="text-[11px] text-gray-500">
          {roleLabel(invitation.role)} · {status}
        </p>
      </div>
      {!invitation.revokedAt && !expired ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void onRevoke(invitation.id)}
        >
          Revoca
        </Button>
      ) : null}
    </div>
  );
}
function knowledgeStatusLabel(status: string, sourceCount: number) {
  if (status === "ready")
    return `${sourceCount} ${sourceCount === 1 ? "fonte pronta" : "fonti pronte"} per rispondere`;
  if (status === "processing") return "Informazioni in aggiornamento";
  if (status === "error") return "Alcune informazioni richiedono attenzione";
  return sourceCount > 0
    ? `${sourceCount} fonti disponibili`
    : "Nessuna informazione collegata";
}
function roleLabel(role: WorkspaceRole) {
  return {
    viewer: "Solo lettura",
    operator: "Operatore chat",
    admin: "Amministratore",
    owner: "Proprietario",
  }[role];
}
function targetTypeLabel(targetType: string) {
  return (
    {
      workspace_membership: "accesso al team",
      workspace_invitation: "invito",
      chatbot: "chatbot",
    }[targetType] || "account"
  );
}
function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    "workspace.created": "Spazio aziendale creato",
    "invitation.created": "Invito creato",
    "invitation.accepted": "Invito accettato",
    "invitation.revoked": "Invito revocato",
    "membership.updated": "Permessi aggiornati",
    "membership.removed": "Collaboratore rimosso",
    "chatbot.workspace_transferred_in": "Chatbot assegnato all’azienda",
  };
  return labels[action] || "Attività amministrativa";
}
