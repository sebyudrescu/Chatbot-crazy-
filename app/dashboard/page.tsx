'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Bot, CalendarDays, ChevronRight, CircleDollarSign, Database, MessageSquare, Plus, Sparkles, Users } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Chatbot {
  id: string
  companyName: string
  isActive: boolean
  kbStatus: string
  kbTotalChunks: number
  _count: { knowledgeSources: number; conversations: number }
}

interface Conversation {
  id: string
  startedAt: string
  lastMessageAt: string | null
  userIntent: string | null
  sentiment: string | null
  needsHumanEscalation: boolean
  messages: Array<{ content: string }>
  chatbot: { id: string; companyName: string }
  _count: { messages: number }
}

interface AIUsage {
  summary: { calls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number; averageLatencyMs: number }
  byModel: Array<{ model: string; calls: number; tokens: number; costUsd: number }>
}

const trendPoints = '0,102 45,83 90,91 135,51 180,71 225,39 270,55 315,26 360,45 405,17 450,36 495,12 540,31'

function MetricCard({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: typeof Bot }) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between"><span className="text-xs font-medium text-gray-500">{label}</span><Icon className="h-4 w-4 text-brand-500" /></div>
      <div><p className="text-2xl font-bold tracking-tight text-gray-950">{value}</p><p className="mt-1 text-[11px] font-medium text-emerald-600">{note}</p></div>
    </div>
  )
}

export default function Dashboard() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<AIUsage | null>(null)

  useEffect(() => {
    Promise.all([fetch('/api/chatbots').then(response => response.json()), fetch('/api/conversations').then(response => response.json()), fetch('/api/ai-usage?days=30').then(response => response.json())])
      .then(([botResult, conversationResult, usageResult]) => {
        setChatbots(botResult.success ? botResult.data : [])
        setConversations(conversationResult.success ? conversationResult.data : [])
        setUsage(usageResult.success ? usageResult.data : null)
      })
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => ({
    messages: conversations.reduce((sum, conversation) => sum + conversation._count.messages, 0),
    sources: chatbots.reduce((sum, bot) => sum + bot._count.knowledgeSources, 0),
    readyBots: chatbots.filter(bot => bot.kbStatus === 'ready').length,
    escalations: conversations.filter(conversation => conversation.needsHumanEscalation).length,
  }), [chatbots, conversations])

  const intents = useMemo(() => {
    const counts = new Map<string, number>()
    conversations.forEach(conversation => counts.set(conversation.userIntent || 'Non classificato', (counts.get(conversation.userIntent || 'Non classificato') || 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [conversations])

  if (loading) return <DashboardLayout><LoadingSpinner fullPage text="Preparazione panoramica..." /></DashboardLayout>

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] space-y-5 p-4 lg:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><p className="eyebrow">Control center</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Panoramica</h1><p className="mt-1 text-sm text-gray-500">Controlla agenti, conversazioni e fonti da un’unica vista.</p></div>
          <div className="flex items-center gap-2"><button className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600">Ultimi 30 giorni</button><Button size="sm" onClick={() => window.dispatchEvent(new Event('open-create-modal'))} icon={<Plus className="h-4 w-4" />}>Nuovo Agente</Button></div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Conversazioni" value={conversations.length} note="Dati complessivi" icon={MessageSquare} />
          <MetricCard label="Messaggi inviati" value={stats.messages} note="Tracciati nel sistema" icon={ArrowUpRight} />
          <MetricCard label="AI Agents" value={chatbots.length} note={`${chatbots.filter(bot => bot.isActive).length} attivi`} icon={Bot} />
          <MetricCard label="Fonti collegate" value={stats.sources} note={`${stats.readyBots} agenti pronti`} icon={Database} />
          <MetricCard label="Handoff richiesti" value={stats.escalations} note="Da gestire manualmente" icon={Users} />
          <MetricCard label="Costo AI" value={`$${(usage?.summary.estimatedCostUsd || 0).toFixed(4)}`} note={`${(usage?.summary.totalTokens || 0).toLocaleString('it-IT')} token · 30 giorni`} icon={CircleDollarSign} />
        </section>

        <section className="card grid gap-5 p-5 md:grid-cols-4">
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Chiamate AI</p><p className="mt-2 text-xl font-bold text-gray-900">{(usage?.summary.calls || 0).toLocaleString('it-IT')}</p><p className="mt-1 text-[10px] text-gray-400">Generazioni ed embeddings</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Token input</p><p className="mt-2 text-xl font-bold text-gray-900">{(usage?.summary.inputTokens || 0).toLocaleString('it-IT')}</p><p className="mt-1 text-[10px] text-emerald-600">{(usage?.summary.cachedInputTokens || 0).toLocaleString('it-IT')} token in cache</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Token output</p><p className="mt-2 text-xl font-bold text-gray-900">{(usage?.summary.outputTokens || 0).toLocaleString('it-IT')}</p><p className="mt-1 text-[10px] text-gray-400">Risposte generate</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Latenza media</p><p className="mt-2 text-xl font-bold text-gray-900">{usage?.summary.averageLatencyMs || 0} ms</p><p className="mt-1 truncate text-[10px] text-brand-600">Modello principale: {usage?.byModel[0]?.model || '—'}</p></div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.8fr_1fr]">
          <div className="card p-5">
            <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-gray-900">Conversazioni nel tempo</h2><p className="mt-1 text-xs text-gray-400">Andamento illustrativo; aggregazione giornaliera nel prossimo incremento.</p></div><span className="rounded-md bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-700">LIVE DATA</span></div>
            <div className="mt-6 h-[230px] w-full overflow-hidden rounded-xl bg-gradient-to-b from-brand-50/40 to-transparent p-4">
              <svg viewBox="0 0 540 125" className="h-full w-full" preserveAspectRatio="none" aria-label="Grafico conversazioni">
                {[20, 45, 70, 95, 120].map(y => <line key={y} x1="0" y1={y} x2="540" y2={y} stroke="#eceaf2" strokeWidth="1" />)}
                <polyline points={trendPoints} fill="none" stroke="#633cff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={`${trendPoints} 540,125 0,125`} fill="url(#area)" stroke="none" />
                <defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7c5cff" stopOpacity=".22" /><stop offset="1" stopColor="#7c5cff" stopOpacity="0" /></linearGradient></defs>
              </svg>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-900">Intenti principali</h2><Link href="/conversations" className="text-xs font-medium text-brand-600">Vedi tutti</Link></div>
            <div className="mt-5 space-y-4">
              {(intents.length ? intents : [['Nessun dato', 0]]).map(([intent, count], index) => {
                const percentage = conversations.length ? Math.max(8, Math.round((Number(count) / conversations.length) * 100)) : 0
                return <div key={String(intent)}><div className="mb-1.5 flex justify-between text-xs"><span className="font-medium capitalize text-gray-700">{intent}</span><span className="text-gray-400">{count}</span></div><div className="h-1.5 rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${percentage}%`, opacity: 1 - index * 0.12 }} /></div></div>
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr_1fr]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><h2 className="text-sm font-semibold text-gray-900">Conversazioni recenti</h2><Link href="/conversations" className="text-xs font-medium text-brand-600">Apri log</Link></div>
            <div className="divide-y divide-gray-100">
              {conversations.slice(0, 5).map(conversation => <Link href="/conversations" key={conversation.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{conversation.chatbot.companyName.slice(0, 1)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-gray-800">{conversation.chatbot.companyName}</p><p className="truncate text-[11px] text-gray-400">{conversation.messages[0]?.content || 'Conversazione avviata'}</p></div><span className="text-[10px] text-gray-400">{conversation._count.messages} msg</span></Link>)}
              {!conversations.length && <div className="px-5 py-10 text-center text-xs text-gray-400">Le nuove conversazioni compariranno qui.</div>}
            </div>
          </div>
          <div className="card p-5"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-semibold text-gray-900">Suggerimenti AI</h2></div><div className="mt-4 space-y-3"><Suggestion title="Completa le fonti" text={`${chatbots.filter(bot => bot.kbStatus !== 'ready').length} agenti non hanno una knowledge base pronta.`} /><Suggestion title="Verifica gli handoff" text={`${stats.escalations} conversazioni richiedono attenzione umana.`} /><Suggestion title="Aggiungi test" text="Crea domande di riferimento prima di pubblicare ogni agente." /></div></div>
          <div className="card p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-900">Stato agenti</h2><CalendarDays className="h-4 w-4 text-gray-400" /></div><div className="mt-4 space-y-3">{chatbots.slice(0, 5).map(bot => <Link href={`/chatbot/${bot.id}/setup`} key={bot.id} className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 hover:border-brand-200"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><Bot className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-gray-800">{bot.companyName}</p><p className="text-[10px] text-gray-400">{bot._count.knowledgeSources} fonti · {bot.kbTotalChunks} chunks</p></div><span className={`h-2 w-2 rounded-full ${bot.kbStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-400'}`} /></Link>)}{!chatbots.length && <p className="py-8 text-center text-xs text-gray-400">Crea il primo agente.</p>}</div></div>
        </section>
      </div>
    </DashboardLayout>
  )
}

function Suggestion({ title, text }: { title: string; text: string }) {
  return <div className="group rounded-xl border border-gray-100 p-3 transition hover:border-brand-200 hover:bg-brand-50/30"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-gray-800">{title}</p><ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-brand-500" /></div><p className="mt-1 text-[11px] leading-4 text-gray-400">{text}</p></div>
}
