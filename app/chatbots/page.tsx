'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bot, Check, Clock3, Copy, Database, Download, FlaskConical, MessageSquare, MoreHorizontal, Palette, Plus, Search, Settings2, Trash2, Upload } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Agent {
  id: string
  companyName: string
  createdAt: string
  isActive: boolean
  kbStatus: string
  kbTotalChunks: number
  promptTemplateId: string | null
  systemPrompt: string | null
  embedSettings: { enabled: boolean } | null
  conversations: Array<{ lastMessageAt: string | null; startedAt: string }>
  _count: { knowledgeSources: number; conversations: number }
}

type StatusFilter = 'all' | 'active' | 'draft' | 'ready'

const statusCopy: Record<string, { label: string; className: string }> = {
  ready: { label: 'Pronto', className: 'bg-emerald-50 text-emerald-700' },
  indexing: { label: 'Indicizzazione', className: 'bg-amber-50 text-amber-700' },
  failed: { label: 'Errore fonti', className: 'bg-red-50 text-red-700' },
  empty: { label: 'Da configurare', className: 'bg-gray-100 text-gray-600' },
}

export default function ChatbotsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const backupInput = useRef<HTMLInputElement>(null)

  const loadAgents = async () => {
    try {
      const response = await fetch('/api/chatbots')
      const result = await response.json()
      setAgents(result.success ? result.data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAgents() }, [])

  const filteredAgents = useMemo(() => agents.filter(agent => {
    const matchesSearch = agent.companyName.toLowerCase().includes(search.trim().toLowerCase())
    const matchesFilter = filter === 'all' || (filter === 'active' && agent.isActive) || (filter === 'draft' && !agent.isActive) || (filter === 'ready' && agent.kbStatus === 'ready')
    return matchesSearch && matchesFilter
  }), [agents, filter, search])

  const toggleAgent = async (agent: Agent) => {
    setBusyId(agent.id)
    try {
      const response = await fetch(`/api/chatbots/${agent.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !agent.isActive }) })
      const result = await response.json()
      if (response.ok) setAgents(current => current.map(item => item.id === agent.id ? { ...item, isActive: !item.isActive } : item))
      else alert(result.error || 'Impossibile modificare lo stato dell’agente')
    } finally { setBusyId(null) }
  }

  const duplicateAgent = async (agent: Agent) => {
    setBusyId(agent.id)
    try {
      const response = await fetch(`/api/chatbots/${agent.id}/clone`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: `${agent.companyName} — Copia` }),
      })
      if (response.ok) await loadAgents()
    } finally { setBusyId(null) }
  }

  const deleteAgent = async (agent: Agent) => {
    if (!confirm(`Eliminare definitivamente “${agent.companyName}”?`)) return
    setBusyId(agent.id)
    try {
      const response = await fetch(`/api/chatbots/${agent.id}`, { method: 'DELETE' })
      if (response.ok) setAgents(current => current.filter(item => item.id !== agent.id))
    } finally { setBusyId(null) }
  }

  const importBackup = async (file?: File) => {
    if (!file) return
    setLoading(true)
    try {
      const response = await fetch('/api/chatbots/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await file.text() })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Backup non valido')
      await loadAgents()
    } catch (error) { alert(error instanceof Error ? error.message : 'Importazione non riuscita') }
    finally { setLoading(false); if (backupInput.current) backupInput.current.value = '' }
  }

  if (loading) return <DashboardLayout><LoadingSpinner fullPage text="Caricamento AI Agents..." /></DashboardLayout>

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] p-4 lg:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><p className="eyebrow">Agent studio</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">AI Agents</h1><p className="mt-1 text-sm text-gray-500">Crea, configura e pubblica gli assistenti dei tuoi clienti.</p></div>
          <div className="flex gap-2"><input ref={backupInput} type="file" accept=".json,application/json" className="hidden" onChange={event => importBackup(event.target.files?.[0])} /><Button variant="secondary" onClick={() => backupInput.current?.click()} icon={<Upload className="h-4 w-4" />}>Importa backup</Button><Button onClick={() => window.dispatchEvent(new Event('open-create-modal'))} icon={<Plus className="h-4 w-4" />}>Nuovo Agente</Button></div>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Agenti totali" value={agents.length} icon={Bot} />
          <SummaryCard label="Attivi" value={agents.filter(agent => agent.isActive).length} icon={Check} tone="success" />
          <SummaryCard label="Knowledge base pronte" value={agents.filter(agent => agent.kbStatus === 'ready').length} icon={Database} />
          <SummaryCard label="Conversazioni" value={agents.reduce((sum, agent) => sum + agent._count.conversations, 0)} icon={MessageSquare} />
        </section>

        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-[#ebeaf0] bg-white p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cerca un agente..." className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100" /></div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-gray-50 p-1">
            {([['all', 'Tutti'], ['active', 'Attivi'], ['draft', 'Bozze'], ['ready', 'Pronti']] as const).map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-2 text-xs font-semibold transition ${filter === value ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>)}
          </div>
        </div>

        {filteredAgents.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredAgents.map(agent => <AgentCard key={agent.id} agent={agent} busy={busyId === agent.id} onToggle={() => toggleAgent(agent)} onDuplicate={() => duplicateAgent(agent)} onDelete={() => deleteAgent(agent)} />)}
          </div>
        ) : (
          <div className="mt-5 flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50"><Bot className="h-6 w-6 text-brand-600" /></div><h2 className="mt-4 text-base font-semibold text-gray-900">Nessun agente trovato</h2><p className="mt-1 max-w-sm text-sm text-gray-500">Modifica la ricerca oppure crea un nuovo agente per il prossimo cliente.</p><Button className="mt-5" onClick={() => window.dispatchEvent(new Event('open-create-modal'))} icon={<Plus className="h-4 w-4" />}>Crea agente</Button></div>
        )}
      </div>
    </DashboardLayout>
  )
}

function SummaryCard({ label, value, icon: Icon, tone = 'brand' }: { label: string; value: number; icon: typeof Bot; tone?: 'brand' | 'success' }) {
  return <div className="card flex items-center gap-4 p-4"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'}`}><Icon className="h-5 w-5" /></div><div><p className="text-2xl font-bold tracking-tight text-gray-950">{value}</p><p className="text-xs text-gray-500">{label}</p></div></div>
}

function AgentCard({ agent, busy, onToggle, onDuplicate, onDelete }: { agent: Agent; busy: boolean; onToggle: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const kb = statusCopy[agent.kbStatus] || statusCopy.empty
  const lastActivity = agent.conversations[0]?.lastMessageAt || agent.conversations[0]?.startedAt

  return (
    <article className={`card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-medium ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-100"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-semibold text-gray-950">{agent.companyName}</h2><span className={`h-2 w-2 rounded-full ${agent.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} /></div><div className="mt-1 flex flex-wrap items-center gap-1.5"><Link href={`/chatbot/${agent.id}/onboarding`} className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition hover:ring-2 hover:ring-brand-100 ${kb.className}`}>{kb.label}</Link>{agent.embedSettings?.enabled && <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Widget attivo</span>}</div></div>
          <details className="relative"><summary aria-label="Azioni agente" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-gray-100 bg-white p-1.5 shadow-hard"><button onClick={onDuplicate} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50"><Copy className="h-3.5 w-3.5" />Duplica configurazione</button><a href={`/api/chatbots/${agent.id}/export`} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50"><Download className="h-3.5 w-3.5" />Scarica backup</a><button onClick={onToggle} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50"><Check className="h-3.5 w-3.5" />{agent.isActive ? 'Disattiva' : 'Attiva'}</button><button onClick={onDelete} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Elimina</button></div></details>
        </div>

        <div className="mt-5 grid grid-cols-3 divide-x divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60 py-3 text-center"><div><p className="text-sm font-bold text-gray-900">{agent._count.conversations}</p><p className="text-[10px] text-gray-400">Conversazioni</p></div><div><p className="text-sm font-bold text-gray-900">{agent._count.knowledgeSources}</p><p className="text-[10px] text-gray-400">Fonti</p></div><div><p className="text-sm font-bold text-gray-900">{agent.kbTotalChunks}</p><p className="text-[10px] text-gray-400">Chunks</p></div></div>
        <div className="mt-4 flex items-center justify-between text-[10px] text-gray-400"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{lastActivity ? `Attività ${formatRelative(lastActivity)}` : 'Nessuna conversazione'}</span><span>{agent.promptTemplateId || (agent.systemPrompt ? 'Prompt personalizzato' : 'Prompt da configurare')}</span></div>
      </div>
      <div className="grid grid-cols-4 border-t border-gray-100 bg-gray-50/70 p-2">
        <CardAction href={`/chatbot/${agent.id}/settings`} icon={Settings2} label="Configura" />
        <CardAction href={`/chatbot/${agent.id}/knowledge`} icon={Database} label="Fonti" />
        <CardAction href={`/chat/${agent.id}`} icon={FlaskConical} label="Test" />
        <CardAction href={`/chatbot/${agent.id}/embed`} icon={Palette} label="Widget" />
      </div>
    </article>
  )
}

function CardAction({ href, icon: Icon, label }: { href: string; icon: typeof Bot; label: string }) {
  return <Link href={href} className="flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium text-gray-500 transition hover:bg-white hover:text-brand-700 hover:shadow-sm"><Icon className="h-4 w-4" />{label}</Link>
}

function formatRelative(value: string) {
  const difference = Date.now() - new Date(value).getTime()
  const minutes = Math.max(1, Math.floor(difference / 60000))
  if (minutes < 60) return `${minutes} min fa`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h fa`
  return `${Math.floor(hours / 24)} g fa`
}
