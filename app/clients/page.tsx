'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Bot, Check, Copy, ExternalLink, Mail, ShieldCheck, Users } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

type Workspace = {
  id: string
  name: string
  slug: string
  kind: string
  _count: { chatbots: number; memberships: number }
}

type Chatbot = { id: string; companyName: string; workspaceId: string; isActive: boolean }
type InviteResult = { email: string; role: string; workspaceName: string; acceptUrl: string }

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.error || 'Operazione non riuscita')
  return result.data as T
}

export default function ClientsPage() {
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [chatbots, setChatbots] = useState<Chatbot[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [selectedBotId, setSelectedBotId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'owner' | 'admin' | 'operator' | 'viewer'>('owner')
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const account = await apiRequest<{ mode: string }>('/api/auth/me')
      if (account.mode !== 'owner') {
        router.replace('/portal')
        return
      }
      const [workspaceData, chatbotData] = await Promise.all([
        apiRequest<Workspace[]>('/api/workspaces'),
        apiRequest<Chatbot[]>('/api/chatbots'),
      ])
      setWorkspaces(workspaceData.filter(workspace => workspace.kind === 'client'))
      setChatbots(chatbotData)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile caricare i clienti')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { void loadData() }, [loadData])

  const selectedWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.id === selectedWorkspaceId),
    [selectedWorkspaceId, workspaces],
  )

  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault()
    setWorking('workspace')
    setError('')
    setSuccess('')
    try {
      const workspace = await apiRequest<Workspace>('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: workspaceName }) })
      setWorkspaceName('')
      setSelectedWorkspaceId(workspace.id)
      setSuccess(`Cliente “${workspace.name}” creato. Ora puoi assegnare il suo agente e invitarlo.`)
      await loadData()
      setSelectedWorkspaceId(workspace.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Creazione non riuscita')
    } finally {
      setWorking(null)
    }
  }

  const assignChatbot = async () => {
    const chatbot = chatbots.find(item => item.id === selectedBotId)
    if (!chatbot || !selectedWorkspace) return
    if (!window.confirm(`Assegnare “${chatbot.companyName}” a “${selectedWorkspace.name}”? Il cliente potrà vedere i dati di questo agente.`)) return
    setWorking('assign')
    setError('')
    setSuccess('')
    try {
      await apiRequest(`/api/chatbots/${chatbot.id}/workspace`, { method: 'POST', body: JSON.stringify({ workspaceId: selectedWorkspace.id }) })
      setSuccess(`Agente “${chatbot.companyName}” assegnato a “${selectedWorkspace.name}”.`)
      await loadData()
      setSelectedWorkspaceId(selectedWorkspace.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Assegnazione non riuscita')
    } finally {
      setWorking(null)
    }
  }

  const createInvite = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedWorkspaceId) return
    setWorking('invite')
    setError('')
    setSuccess('')
    setInviteResult(null)
    try {
      const invite = await apiRequest<InviteResult>(`/api/workspaces/${selectedWorkspaceId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, expiresInHours: 72 }),
      })
      setInviteResult(invite)
      setInviteEmail('')
      setSuccess(`Accesso preparato per ${invite.email}. Il link scade tra 72 ore.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invito non riuscito')
    } finally {
      setWorking(null)
    }
  }

  const copyInvite = async () => {
    if (!inviteResult) return
    await navigator.clipboard.writeText(inviteResult.acceptUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return <DashboardLayout>
    <div className="mx-auto max-w-7xl space-y-6 p-5 lg:p-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-brand-600">GESTIONE CLIENTI</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">Consegna ogni agente al suo cliente</h1><p className="mt-2 max-w-3xl text-sm text-gray-500">Crea lo spazio privato, collega il chatbot corretto e genera l’accesso. Ogni cliente vedrà esclusivamente i propri dati.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800"><ShieldCheck className="h-4 w-4" /> Isolamento dati attivo</div>
      </div>

      {(error || success) && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || success}</div>}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="space-y-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Building2 className="h-5 w-5" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Passaggio 1</p><h2 className="mt-1 text-lg font-bold text-gray-950">Crea il cliente</h2><p className="mt-1 text-sm text-gray-500">Uno spazio privato per azienda, separato dagli altri clienti.</p></div>
          <form onSubmit={createWorkspace} className="space-y-3"><Input label="Nome azienda" value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder="Es. Suddenly Verona" minLength={2} maxLength={120} required /><Button type="submit" fullWidth loading={working === 'workspace'}>Crea spazio cliente</Button></form>
        </Card>

        <Card className="space-y-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Bot className="h-5 w-5" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Passaggio 2</p><h2 className="mt-1 text-lg font-bold text-gray-950">Assegna il chatbot</h2><p className="mt-1 text-sm text-gray-500">L’agente e tutti i suoi dati diventano visibili solo a quel cliente.</p></div>
          <label className="block text-sm font-medium text-gray-700">Cliente<select className="input mt-1" value={selectedWorkspaceId} onChange={event => setSelectedWorkspaceId(event.target.value)}><option value="">Seleziona un cliente</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
          <label className="block text-sm font-medium text-gray-700">Agente<select className="input mt-1" value={selectedBotId} onChange={event => setSelectedBotId(event.target.value)}><option value="">Seleziona un agente</option>{chatbots.map(chatbot => <option key={chatbot.id} value={chatbot.id}>{chatbot.companyName}{chatbot.workspaceId === selectedWorkspaceId ? ' — già assegnato' : ''}</option>)}</select></label>
          <Button type="button" fullWidth loading={working === 'assign'} disabled={!selectedWorkspaceId || !selectedBotId} onClick={assignChatbot}>Assegna in sicurezza</Button>
        </Card>

        <Card className="space-y-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Mail className="h-5 w-5" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Passaggio 3</p><h2 className="mt-1 text-lg font-bold text-gray-950">Invita il cliente</h2><p className="mt-1 text-sm text-gray-500">Riceverà un account protetto con il ruolo scelto. Nessun pagamento richiesto.</p></div>
          <form onSubmit={createInvite} className="space-y-3"><Input label="Email cliente" type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="cliente@azienda.it" required /><label className="block text-sm font-medium text-gray-700">Ruolo<select className="input mt-1" value={inviteRole} onChange={event => setInviteRole(event.target.value as typeof inviteRole)}><option value="owner">Proprietario</option><option value="admin">Amministratore</option><option value="operator">Operatore</option><option value="viewer">Solo lettura</option></select></label><Button type="submit" fullWidth loading={working === 'invite'} disabled={!selectedWorkspaceId}>Genera accesso</Button></form>
          {inviteResult && <div className="rounded-xl border border-brand-200 bg-brand-50 p-3"><p className="text-xs font-semibold text-brand-800">Link monouso per {inviteResult.email}</p><p className="mt-1 truncate text-xs text-brand-600">{inviteResult.acceptUrl}</p><div className="mt-3 flex gap-2"><Button type="button" size="sm" variant="secondary" onClick={copyInvite} icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}>{copied ? 'Copiato' : 'Copia'}</Button><a className="btn btn-sm btn-secondary" href={inviteResult.acceptUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Apri</a></div></div>}
        </Card>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="font-bold text-gray-950">Clienti configurati</h2><p className="text-sm text-gray-500">Panoramica di accessi e agenti assegnati</p></div><Users className="h-5 w-5 text-gray-400" /></div>
        {loading ? <p className="p-6 text-sm text-gray-500">Caricamento clienti…</p> : workspaces.length === 0 ? <p className="p-6 text-sm text-gray-500">Nessun cliente configurato. Inizia dal passaggio 1.</p> : <div className="divide-y divide-gray-100">{workspaces.map(workspace => { const bots = chatbots.filter(chatbot => chatbot.workspaceId === workspace.id); return <button key={workspace.id} type="button" onClick={() => setSelectedWorkspaceId(workspace.id)} className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between ${selectedWorkspaceId === workspace.id ? 'bg-brand-50/60' : ''}`}><div><p className="font-semibold text-gray-950">{workspace.name}</p><p className="mt-1 text-xs text-gray-500">{bots.length ? bots.map(bot => bot.companyName).join(', ') : 'Nessun agente assegnato'}</p></div><div className="flex gap-2 text-xs"><span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-600">{workspace._count?.memberships || 0} accessi</span><span className="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-700">{bots.length} agenti</span></div></button> })}</div>}
      </Card>
    </div>
  </DashboardLayout>
}
