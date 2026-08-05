'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Bot, Check, ChevronRight, Database, FlaskConical, Loader2, MessageSquare, Palette, Rocket, Settings2, ShoppingBag, ShieldAlert } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import type { AgentReadinessCheck, ReadinessCheckKey } from '@/lib/agent-readiness'

interface Readiness {
  botId: string
  companyName: string
  isActive: boolean
  ready: boolean
  status: 'draft' | 'ready' | 'published' | 'attention'
  attentionRequired: boolean
  completed: number
  total: number
  configurationChangedAt: string | null
  checks: AgentReadinessCheck[]
}

const checkIcons: Record<ReadinessCheckKey, typeof Settings2> = {
  instructions: Settings2,
  knowledge: Database,
  conversation: MessageSquare,
  evaluations: FlaskConical,
  channel: Palette,
  commerce: ShoppingBag,
}

export default function AgentOnboardingPage() {
  const { id } = useParams<{ id: string }>()
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadReadiness = useCallback(async () => {
    const result = await fetch(`/api/chatbots/${id}/readiness`).then(response => response.json())
    if (!result.success) throw new Error(result.error || 'Impossibile caricare la checklist')
    setReadiness(result.data)
  }, [id])

  useEffect(() => {
    loadReadiness()
      .catch(cause => setNotice({ type: 'error', text: cause instanceof Error ? cause.message : 'Caricamento non riuscito' }))
      .finally(() => setLoading(false))
  }, [loadReadiness])

  const publish = async () => {
    if (!readiness?.ready || publishing) return
    setPublishing(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/chatbots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Pubblicazione non riuscita')
      await loadReadiness()
      setNotice({ type: 'success', text: 'Agente pubblicato. Il widget può ora rispondere sui canali abilitati.' })
    } catch (cause) {
      setNotice({ type: 'error', text: cause instanceof Error ? cause.message : 'Pubblicazione non riuscita' })
    } finally {
      setPublishing(false)
    }
  }

  if (loading) return <DashboardLayout><div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div></DashboardLayout>
  if (!readiness) return <DashboardLayout><div className="p-8 text-sm text-red-600">{notice?.text || 'Agente non trovato.'}</div></DashboardLayout>

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl p-4 lg:p-8">
        <div className={`overflow-hidden rounded-2xl p-6 text-white ${readiness.status === 'published' ? 'bg-gradient-to-r from-emerald-600 to-teal-500' : readiness.status === 'attention' ? 'bg-gradient-to-r from-amber-600 to-orange-500' : 'bg-gradient-to-r from-gray-950 to-brand-800'}`}>
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/60">{readiness.status === 'published' ? 'Pubblicato e verificato' : readiness.status === 'attention' ? 'Attivo · controlli richiesti' : readiness.ready ? 'Pronto per la pubblicazione' : 'Configurazione guidata'}</p>
              <h1 className="mt-2 text-2xl font-bold">{readiness.companyName}</h1>
              <p className="mt-2 max-w-xl text-xs leading-5 text-white/70">
                {readiness.status === 'published'
                  ? 'L’agente è attivo e tutti i controlli correnti risultano superati.'
                  : readiness.status === 'attention'
                    ? 'L’agente è ancora attivo, ma uno o più controlli non sono aggiornati. Completa la checklist prima della consegna al cliente.'
                  : readiness.ready
                    ? 'Tutti i controlli obbligatori sono superati. Puoi pubblicare l’agente per il cliente.'
                    : 'Completa ogni controllo per consegnare un agente affidabile, misurabile e pubblicabile.'}
              </p>
            </div>
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 text-xl font-bold">{readiness.completed}/{readiness.total}</div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${readiness.completed / readiness.total * 100}%` }} /></div>
        </div>

        {notice && <div role="status" className={`mt-5 rounded-xl border px-4 py-3 text-xs ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div>}

        <div className="mt-6 space-y-3">
          {readiness.checks.map((check, index) => {
            const Icon = checkIcons[check.key]
            return (
              <Link key={check.key} href={check.href} className="card flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${check.done ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'}`}>{check.done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Controllo {index + 1}</span>{check.done && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">Completato</span>}</div>
                  <h2 className="mt-1 text-sm font-semibold text-gray-900">{check.label}</h2>
                  <p className="mt-1 text-[11px] text-gray-500">{check.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </Link>
            )
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/chatbots" className="btn btn-secondary"><Bot className="h-4 w-4" />Tutti gli agenti</Link>
          {readiness.isActive
            ? <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold ${readiness.attentionRequired ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{readiness.attentionRequired ? <ShieldAlert className="h-4 w-4" /> : <Check className="h-4 w-4" />}{readiness.attentionRequired ? `Completa ${readiness.total - readiness.completed} controlli` : 'Agente pubblicato e verificato'}</div>
            : <Button onClick={publish} disabled={!readiness.ready || publishing} loading={publishing} icon={!publishing ? <Rocket className="h-4 w-4" /> : undefined}>{readiness.ready ? 'Pubblica agente' : `Completa ${readiness.total - readiness.completed} controlli`}</Button>}
        </div>
      </div>
    </DashboardLayout>
  )
}
