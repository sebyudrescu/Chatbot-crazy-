'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Bot, Building2, Copy, Loader2, LogOut, MessageSquareText, RefreshCcw, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

type WorkspaceRole = 'owner' | 'admin' | 'operator' | 'viewer'
type Account = { mode: 'client'; displayName: string; email: string; memberships: Array<{ role: WorkspaceRole; workspace: { id: string; name: string; slug: string } }> }
type Agent = { id: string; companyName: string; isActive: boolean; kbStatus: string; _count: { conversations: number; knowledgeSources: number } }
type Analytics = { conversations: number; messages: number; leads: number }
type Member = { id: string; role: WorkspaceRole; status: 'active' | 'suspended'; user: { id: string; displayName: string; email: string; status: string } }
type Invitation = { id: string; email: string; role: WorkspaceRole; expiresAt: string; acceptedAt: string | null; revokedAt: string | null }
type AuditEntry = { id: string; action: string; targetType: string; createdAt: string; actor: { displayName: string; email: string } | null }

export default function ClientPortalPage() {
  const router = useRouter()
  const [account, setAccount] = useState<Account | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [analytics, setAnalytics] = useState<Analytics>({ conversations: 0, messages: 0, leads: 0 })
  const [error, setError] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamMessage, setTeamMessage] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('viewer')
  const [latestInviteUrl, setLatestInviteUrl] = useState('')

  useEffect(() => {
    Promise.all([fetch('/api/auth/me'), fetch('/api/chatbots'), fetch('/api/analytics?days=30')])
      .then(async responses => Promise.all(responses.map(async response => ({ ok: response.ok, body: await response.json() }))))
      .then(([me, bots, stats]) => {
        if (!me.ok || me.body.data?.mode !== 'client') throw new Error('Sessione cliente non valida')
        if (!bots.ok || !stats.ok) throw new Error('Non è stato possibile caricare il portale')
        setAccount(me.body.data); setAgents(bots.body.data || [])
        const manageable = (me.body.data.memberships || []).find((membership: Account['memberships'][number]) => membership.role === 'owner' || membership.role === 'admin')
        setSelectedWorkspaceId(manageable?.workspace.id || '')
        setAnalytics({ conversations: stats.body.data?.totals?.conversations || 0, messages: stats.body.data?.totals?.messages || 0, leads: stats.body.data?.identifiedContacts || 0 })
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Portale non disponibile'))
  }, [])

  const loadTeam = async (workspaceId: string) => {
    if (!workspaceId) return
    setTeamBusy(true); setTeamMessage('')
    try {
      const [membersResponse, invitationsResponse, auditResponse] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/members`),
        fetch(`/api/workspaces/${workspaceId}/invitations`),
        fetch(`/api/workspaces/${workspaceId}/audit`),
      ])
      const [membersBody, invitationsBody, auditBody] = await Promise.all([membersResponse.json(), invitationsResponse.json(), auditResponse.json()])
      if (!membersResponse.ok || !invitationsResponse.ok || !auditResponse.ok) throw new Error(membersBody.error || invitationsBody.error || auditBody.error || 'Team non disponibile')
      setMembers(membersBody.data || []); setInvitations(invitationsBody.data || []); setAuditEntries(auditBody.data || [])
    } catch (reason) {
      setTeamMessage(reason instanceof Error ? reason.message : 'Team non disponibile')
    } finally { setTeamBusy(false) }
  }

  useEffect(() => { if (selectedWorkspaceId) void loadTeam(selectedWorkspaceId) }, [selectedWorkspaceId])

  const inviteMember = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedWorkspaceId || !inviteEmail.trim()) return
    setTeamBusy(true); setTeamMessage(''); setLatestInviteUrl('')
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspaceId}/invitations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail, role: inviteRole, expiresInHours: 72 }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Invito non riuscito')
      setInviteEmail(''); setLatestInviteUrl(body.data.acceptUrl); setTeamMessage('Invito creato. Condividi il link tramite un canale sicuro.')
      await loadTeam(selectedWorkspaceId)
    } catch (reason) { setTeamMessage(reason instanceof Error ? reason.message : 'Invito non riuscito') }
    finally { setTeamBusy(false) }
  }

  const updateMember = async (membershipId: string, update: Partial<Pick<Member, 'role' | 'status'>>) => {
    if (!selectedWorkspaceId) return
    setTeamBusy(true); setTeamMessage('')
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspaceId}/members/${membershipId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Modifica non riuscita')
      setTeamMessage('Accesso aggiornato.'); await loadTeam(selectedWorkspaceId)
    } catch (reason) { setTeamMessage(reason instanceof Error ? reason.message : 'Modifica non riuscita') }
    finally { setTeamBusy(false) }
  }

  const removeMember = async (membershipId: string) => {
    if (!selectedWorkspaceId || !window.confirm('Rimuovere questo membro dal workspace?')) return
    setTeamBusy(true); setTeamMessage('')
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspaceId}/members/${membershipId}`, { method: 'DELETE' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Rimozione non riuscita')
      setTeamMessage('Membro rimosso.'); await loadTeam(selectedWorkspaceId)
    } catch (reason) { setTeamMessage(reason instanceof Error ? reason.message : 'Rimozione non riuscita') }
    finally { setTeamBusy(false) }
  }

  const revokeInvitation = async (invitationId: string) => {
    if (!selectedWorkspaceId) return
    setTeamBusy(true); setTeamMessage('')
    try {
      const response = await fetch(`/api/workspaces/${selectedWorkspaceId}/invitations/${invitationId}`, { method: 'DELETE' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Revoca non riuscita')
      setTeamMessage('Invito revocato.'); await loadTeam(selectedWorkspaceId)
    } catch (reason) { setTeamMessage(reason instanceof Error ? reason.message : 'Revoca non riuscita') }
    finally { setTeamBusy(false) }
  }

  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); router.refresh() }
  if (!account && !error) return <main className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></main>
  if (error) return <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6"><div className="max-w-sm rounded-2xl border border-red-200 bg-white p-6 text-center"><p className="text-sm text-red-700">{error}</p><Button className="mt-4" onClick={() => router.replace('/login')}>Torna all’accesso</Button></div></main>

  const manageableMemberships = account!.memberships.filter(membership => membership.role === 'owner' || membership.role === 'admin')
  const selectedRole = manageableMemberships.find(membership => membership.workspace.id === selectedWorkspaceId)?.role

  return <main className="min-h-screen bg-gray-50"><header className="border-b border-gray-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white"><Bot className="h-5 w-5" /></div><div><p className="font-bold text-gray-950">LitX AI</p><p className="text-[10px] uppercase tracking-widest text-gray-400">Portale cliente</p></div></div><Button variant="secondary" onClick={logout} icon={<LogOut className="h-4 w-4" />}>Esci</Button></div></header><div className="mx-auto max-w-6xl px-5 py-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm text-gray-500">Bentornato, {account!.displayName}</p><h1 className="mt-1 text-3xl font-bold text-gray-950">Il tuo spazio operativo</h1></div><div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" />Dati isolati per azienda</div></div><div className="mt-7 grid gap-4 md:grid-cols-3"><Metric icon={<MessageSquareText />} label="Conversazioni · 30 giorni" value={analytics.conversations} /><Metric icon={<BarChart3 />} label="Messaggi · 30 giorni" value={analytics.messages} /><Metric icon={<Building2 />} label="Lead identificati" value={analytics.leads} /></div><section className="mt-8"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-gray-950">I tuoi agenti</h2><p className="mt-1 text-xs text-gray-500">Visualizzi esclusivamente gli agenti dei workspace a cui sei stato invitato.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-2">{agents.map(agent => <article key={agent.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-gray-950">{agent.companyName}</h3><p className="mt-1 text-xs text-gray-500">Knowledge base: {agent.kbStatus}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${agent.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{agent.isActive ? 'Attivo' : 'Bozza'}</span></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xl font-bold text-gray-950">{agent._count.conversations}</p><p className="text-[10px] uppercase tracking-wide text-gray-400">Conversazioni</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xl font-bold text-gray-950">{agent._count.knowledgeSources}</p><p className="text-[10px] uppercase tracking-wide text-gray-400">Fonti</p></div></div></article>)}{agents.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Nessun agente assegnato a questo account.</div>}</div></section>

  {manageableMemberships.length > 0 && <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><Users className="h-5 w-5 text-brand-600" /><h2 className="text-lg font-bold text-gray-950">Team e accessi</h2></div><p className="mt-1 text-xs text-gray-500">Inviti, ruoli e revoche sono registrati nell’audit del workspace.</p></div>{manageableMemberships.length > 1 && <label className="text-xs font-semibold text-gray-600">Workspace<select value={selectedWorkspaceId} onChange={event => setSelectedWorkspaceId(event.target.value)} className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">{manageableMemberships.map(membership => <option key={membership.workspace.id} value={membership.workspace.id}>{membership.workspace.name}</option>)}</select></label>}</div>
  <form onSubmit={inviteMember} className="mt-6 grid gap-3 rounded-xl bg-gray-50 p-4 md:grid-cols-[1fr_180px_auto]"><Input type="email" label="Email del collaboratore" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="nome@azienda.it" required /><label className="text-sm font-medium text-gray-700">Ruolo<select value={inviteRole} onChange={event => setInviteRole(event.target.value as WorkspaceRole)} className="input mt-1" disabled={selectedRole !== 'owner' && inviteRole === 'owner'}><option value="viewer">Viewer</option><option value="operator">Operatore</option><option value="admin">Admin</option>{selectedRole === 'owner' && <option value="owner">Proprietario</option>}</select></label><Button type="submit" className="self-end" loading={teamBusy} icon={<UserPlus className="h-4 w-4" />}>Crea invito</Button></form>
  {teamMessage && <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700" role="status">{teamMessage}</p>}
  {latestInviteUrl && <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center"><code className="min-w-0 flex-1 truncate text-xs text-amber-950">{latestInviteUrl}</code><Button type="button" size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void navigator.clipboard.writeText(latestInviteUrl)}>Copia link</Button></div>}
  <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400"><th className="pb-3">Membro</th><th className="pb-3">Ruolo</th><th className="pb-3">Stato</th><th className="pb-3 text-right">Azioni</th></tr></thead><tbody>{members.map(member => <tr key={member.id} className="border-b border-gray-100"><td className="py-3"><p className="font-semibold text-gray-900">{member.user.displayName}</p><p className="text-xs text-gray-500">{member.user.email}</p></td><td className="py-3"><select aria-label={`Ruolo di ${member.user.displayName}`} value={member.role} onChange={event => void updateMember(member.id, { role: event.target.value as WorkspaceRole })} disabled={teamBusy || (member.role === 'owner' && selectedRole !== 'owner')} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"><option value="viewer">Viewer</option><option value="operator">Operatore</option><option value="admin">Admin</option>{selectedRole === 'owner' && <option value="owner">Proprietario</option>}</select></td><td className="py-3"><button type="button" disabled={teamBusy || (member.role === 'owner' && selectedRole !== 'owner')} onClick={() => void updateMember(member.id, { status: member.status === 'active' ? 'suspended' : 'active' })} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${member.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{member.status === 'active' ? 'Attivo' : 'Sospeso'}</button></td><td className="py-3 text-right"><button type="button" disabled={teamBusy || (member.role === 'owner' && selectedRole !== 'owner')} onClick={() => void removeMember(member.id)} className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40" aria-label={`Rimuovi ${member.user.displayName}`}><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table>{teamBusy && members.length === 0 && <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Caricamento team…</div>}</div>
  <div className="mt-7"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-gray-900">Inviti recenti</h3><button type="button" onClick={() => void loadTeam(selectedWorkspaceId)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Aggiorna team"><RefreshCcw className="h-4 w-4" /></button></div><div className="mt-2 space-y-2">{invitations.filter(invitation => !invitation.acceptedAt).map(invitation => <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{invitation.email}</p><p className="text-[11px] text-gray-500">{invitation.role} · {invitation.revokedAt ? 'revocato' : new Date(invitation.expiresAt) < new Date() ? 'scaduto' : 'in attesa'}</p></div>{!invitation.revokedAt && <Button type="button" size="sm" variant="ghost" onClick={() => void revokeInvitation(invitation.id)}>Revoca</Button>}</div>)}{invitations.filter(invitation => !invitation.acceptedAt).length === 0 && <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">Nessun invito in attesa.</p>}</div></div>
  <div className="mt-7"><h3 className="text-sm font-bold text-gray-900">Audit accessi</h3><div className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100">{auditEntries.slice(0, 8).map(entry => <div key={entry.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-gray-800">{auditActionLabel(entry.action)}</p><p className="text-[11px] text-gray-500">{entry.actor?.displayName || 'LitX Agency'} · {entry.targetType}</p></div><time className="text-[10px] text-gray-400" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('it-IT')}</time></div>)}{auditEntries.length === 0 && <p className="px-3 py-4 text-center text-xs text-gray-500">Nessuna attività amministrativa registrata.</p>}</div></div>
  </section>}</div></main>
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    'workspace.created': 'Workspace creato',
    'invitation.created': 'Invito creato',
    'invitation.accepted': 'Invito accettato',
    'invitation.revoked': 'Invito revocato',
    'membership.updated': 'Accesso membro aggiornato',
    'membership.removed': 'Membro rimosso',
  }
  return labels[action] || action
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div><p className="mt-4 text-2xl font-bold text-gray-950">{value.toLocaleString('it-IT')}</p><p className="mt-1 text-xs text-gray-500">{label}</p></div>
}
