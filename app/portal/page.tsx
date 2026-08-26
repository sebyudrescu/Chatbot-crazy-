'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Bot, Building2, Loader2, LogOut, MessageSquareText, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'

type Account = { mode: 'client'; displayName: string; email: string; memberships: Array<{ role: string; workspace: { id: string; name: string; slug: string } }> }
type Agent = { id: string; companyName: string; isActive: boolean; kbStatus: string; _count: { conversations: number; knowledgeSources: number } }
type Analytics = { conversations: number; messages: number; leads: number }

export default function ClientPortalPage() {
  const router = useRouter()
  const [account, setAccount] = useState<Account | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [analytics, setAnalytics] = useState<Analytics>({ conversations: 0, messages: 0, leads: 0 })
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([fetch('/api/auth/me'), fetch('/api/chatbots'), fetch('/api/analytics?days=30')])
      .then(async responses => Promise.all(responses.map(async response => ({ ok: response.ok, body: await response.json() }))))
      .then(([me, bots, stats]) => {
        if (!me.ok || me.body.data?.mode !== 'client') throw new Error('Sessione cliente non valida')
        if (!bots.ok || !stats.ok) throw new Error('Non è stato possibile caricare il portale')
        setAccount(me.body.data); setAgents(bots.body.data || [])
        setAnalytics({ conversations: stats.body.data?.totals?.conversations || 0, messages: stats.body.data?.totals?.messages || 0, leads: stats.body.data?.identifiedContacts || 0 })
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Portale non disponibile'))
  }, [])

  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); router.refresh() }
  if (!account && !error) return <main className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></main>
  if (error) return <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6"><div className="max-w-sm rounded-2xl border border-red-200 bg-white p-6 text-center"><p className="text-sm text-red-700">{error}</p><Button className="mt-4" onClick={() => router.replace('/login')}>Torna all’accesso</Button></div></main>

  return <main className="min-h-screen bg-gray-50"><header className="border-b border-gray-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white"><Bot className="h-5 w-5" /></div><div><p className="font-bold text-gray-950">LitX AI</p><p className="text-[10px] uppercase tracking-widest text-gray-400">Portale cliente</p></div></div><Button variant="secondary" onClick={logout} icon={<LogOut className="h-4 w-4" />}>Esci</Button></div></header><div className="mx-auto max-w-6xl px-5 py-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm text-gray-500">Bentornato, {account!.displayName}</p><h1 className="mt-1 text-3xl font-bold text-gray-950">Il tuo spazio operativo</h1></div><div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" />Dati isolati per azienda</div></div><div className="mt-7 grid gap-4 md:grid-cols-3"><Metric icon={<MessageSquareText />} label="Conversazioni · 30 giorni" value={analytics.conversations} /><Metric icon={<BarChart3 />} label="Messaggi · 30 giorni" value={analytics.messages} /><Metric icon={<Building2 />} label="Lead identificati" value={analytics.leads} /></div><section className="mt-8"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-gray-950">I tuoi agenti</h2><p className="mt-1 text-xs text-gray-500">Visualizzi esclusivamente gli agenti dei workspace a cui sei stato invitato.</p></div></div><div className="mt-4 grid gap-4 md:grid-cols-2">{agents.map(agent => <article key={agent.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-gray-950">{agent.companyName}</h3><p className="mt-1 text-xs text-gray-500">Knowledge base: {agent.kbStatus}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${agent.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{agent.isActive ? 'Attivo' : 'Bozza'}</span></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xl font-bold text-gray-950">{agent._count.conversations}</p><p className="text-[10px] uppercase tracking-wide text-gray-400">Conversazioni</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xl font-bold text-gray-950">{agent._count.knowledgeSources}</p><p className="text-[10px] uppercase tracking-wide text-gray-400">Fonti</p></div></div></article>)}{agents.length === 0 && <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Nessun agente assegnato a questo account.</div>}</div></section></div></main>
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div><p className="mt-4 text-2xl font-bold text-gray-950">{value.toLocaleString('it-IT')}</p><p className="mt-1 text-xs text-gray-500">{label}</p></div>
}
