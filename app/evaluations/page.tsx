'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, CheckCircle2, FlaskConical, Loader2, Play, Plus, ShieldAlert, Trash2, XCircle } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { evaluateResponse } from '@/lib/evaluation'

interface Agent { id: string; companyName: string }
interface Run { id: string; passed: boolean; response: string; confidence?: number | null; latencyMs?: number | null; failureReason?: string | null; metrics?: any; createdAt: string }
interface Case { id: string; botId: string; name: string; question: string; expectedKeywords: string[]; forbiddenKeywords: string[]; minimumConfidence: number; isActive: boolean; runs: Run[] }

export default function EvaluationsPage() {
  const [agents, setAgents] = useState<Agent[]>([]), [selectedId, setSelectedId] = useState(''), [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true), [running, setRunning] = useState(false), [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', question: '', expected: '', forbidden: '', threshold: 50 })

  useEffect(() => { fetch('/api/chatbots').then(r => r.json()).then(result => { const list = result.success ? result.data : []; const requested = new URLSearchParams(window.location.search).get('botId'); setAgents(list); if (list[0]) setSelectedId(list.some((agent: Agent) => agent.id === requested) ? requested! : list[0].id) }).finally(() => setLoading(false)) }, [])
  const loadCases = useCallback(async () => { if (!selectedId) return setCases([]); const result = await fetch(`/api/evaluations?botId=${selectedId}`).then(r => r.json()); setCases(result.success ? result.data : []) }, [selectedId])
  useEffect(() => { loadCases() }, [loadCases])

  const runs = cases.flatMap(item => item.runs), latestRuns = cases.map(item => item.runs[0]).filter(Boolean)
  const passRate = latestRuns.length ? Math.round(latestRuns.filter(run => run.passed).length / latestRuns.length * 100) : 0
  const averageMetric = (path: string[]) => { const values = latestRuns.map(run => path.reduce<any>((value, key) => value?.[key], run.metrics)).filter(value => typeof value === 'number'); return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) : 0 }
  const selected = useMemo(() => agents.find(agent => agent.id === selectedId), [agents, selectedId])

  const createCase = async () => {
    if (!selectedId || !form.name.trim() || !form.question.trim()) return
    setSaving(true)
    await fetch('/api/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: selectedId, name: form.name, question: form.question, expectedKeywords: split(form.expected), forbiddenKeywords: split(form.forbidden), minimumConfidence: form.threshold / 100 }) })
    setForm({ name: '', question: '', expected: '', forbidden: '', threshold: 50 }); await loadCases(); setSaving(false)
  }

  const runAll = async () => {
    const active = cases.filter(item => item.isActive); if (!active.length || running) return
    setRunning(true)
    for (const item of active) {
      const started = performance.now(); let response = '', confidence: number | null = null, conversationId: string | null = null, failureReason: string | null = null, passed = false, metrics: any = null
      try {
        const chat = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: item.botId, message: item.question, userSessionId: `evaluation_${item.id}_${Date.now()}` }) }); const result = await chat.json()
        if (!chat.ok || !result.success) failureReason = result.message || result.error || 'Il chatbot non ha risposto'
        else {
          response = result.data.assistantMessage.content
          confidence = result.data.confidence?.score ?? null
          conversationId = result.data.conversationId
          const judgeResponse = await fetch('/api/evaluations/judge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botId: item.botId,
              question: item.question,
              response,
              confidence,
              expectedKeywords: item.expectedKeywords,
              forbiddenKeywords: item.forbiddenKeywords,
              minimumConfidence: item.minimumConfidence,
            }),
          })
          const judge = await judgeResponse.json()
          const verdict = judgeResponse.ok && judge.success
            ? judge.data
            : evaluateResponse(response, confidence, item)
          passed = verdict.passed
          failureReason = verdict.failureReason
          metrics = verdict.dimensions || null
        }
      } catch { failureReason = 'Servizio non raggiungibile' }
      await fetch('/api/evaluations/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: item.id, passed, response, confidence, latencyMs: Math.round(performance.now() - started), failureReason, metrics }) })
      if (conversationId) await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' }).catch(() => {})
    }
    await fetch('/api/evaluations/calibrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: selectedId }) }).catch(() => {})
    await loadCases(); setRunning(false)
  }

  if (loading) return <DashboardLayout><LoadingSpinner fullPage text="Preparazione valutazioni..." /></DashboardLayout>
  return <DashboardLayout><div className="mx-auto max-w-[1500px] p-4 lg:p-7">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Regression lab</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Valutazioni automatiche</h1><p className="mt-1 text-sm text-gray-500">Controlla che ogni agente mantenga risposte, sicurezza e qualità dopo ogni modifica.</p></div><Button onClick={runAll} disabled={running || !cases.some(item => item.isActive)} icon={running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}>{running ? 'Test in corso...' : 'Esegui tutti'}</Button></header>
    {!agents.length ? <div className="mt-6 card flex min-h-80 flex-col items-center justify-center text-center"><Bot className="h-8 w-8 text-brand-600" /><h2 className="mt-3 font-semibold">Nessun agente disponibile</h2><p className="mt-1 text-sm text-gray-500">Crea un agente per definire i suoi controlli automatici.</p></div> : <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Agente" value={selected?.companyName || '—'} /><Metric label="Successo ultimo run" value={`${passRate}%`} good={passRate >= 80} /><Metric label="Faithfulness" value={`${averageMetric(['faithfulness'])}%`} good={averageMetric(['faithfulness']) >= 70} /><Metric label="Accuratezza risposta" value={`${averageMetric(['answerAccuracy'])}%`} good={averageMetric(['answerAccuracy']) >= 70} /><Metric label="Precision@5" value={`${averageMetric(['retrieval','precisionAtK'])}%`} good={averageMetric(['retrieval','precisionAtK']) >= 60} /><Metric label="Recall@5" value={`${averageMetric(['retrieval','recallAtK'])}%`} good={averageMetric(['retrieval','recallAtK']) >= 70} /><Metric label="MRR" value={`${averageMetric(['retrieval','reciprocalRank'])}%`} good={averageMetric(['retrieval','reciprocalRank']) >= 70} /><Metric label="Esecuzioni salvate" value={String(runs.length)} /></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-5"><div className="card p-5"><label className="label">Agente da verificare</label><select className="input" value={selectedId} onChange={e => setSelectedId(e.target.value)}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.companyName}</option>)}</select></div>
          <div className="card p-5"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-semibold">Nuovo caso di test</h2></div><div className="mt-4 space-y-3"><Field label="Nome" value={form.name} onChange={value => setForm({ ...form, name: value })} placeholder="Es. Informazioni sui prezzi" /><Field label="Domanda da inviare" value={form.question} onChange={value => setForm({ ...form, question: value })} placeholder="Quanto costa il servizio?" textarea /><Field label="Parole attese (separate da virgola)" value={form.expected} onChange={value => setForm({ ...form, expected: value })} placeholder="prezzo, preventivo" /><Field label="Parole vietate" value={form.forbidden} onChange={value => setForm({ ...form, forbidden: value })} placeholder="garantito, inventato" /><label className="label">Confidenza minima: {form.threshold}%</label><input type="range" min="0" max="100" value={form.threshold} onChange={e => setForm({ ...form, threshold: Number(e.target.value) })} className="w-full accent-brand-600" /><Button className="w-full" onClick={createCase} disabled={saving || !form.name.trim() || !form.question.trim()} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>Salva caso</Button></div></div></aside>
        <section className="space-y-3">{!cases.length ? <div className="card flex min-h-[480px] flex-col items-center justify-center text-center"><FlaskConical className="h-9 w-9 text-brand-600" /><h2 className="mt-3 font-semibold">Crea il primo controllo</h2><p className="mt-1 max-w-sm text-xs leading-5 text-gray-500">Aggiungi le domande importanti che il chatbot deve superare prima di essere consegnato al cliente.</p></div> : cases.map(item => <CaseCard key={item.id} item={item} onDelete={async () => { await fetch(`/api/evaluations/${item.id}`, { method: 'DELETE' }); loadCases() }} onToggle={async () => { await fetch(`/api/evaluations/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !item.isActive }) }); loadCases() }} />)}</section>
      </div></>}
  </div></DashboardLayout>
}

function split(value: string) { return value.split(',').map(item => item.trim()).filter(Boolean) }
function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="card p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className={`mt-2 text-xl font-bold ${good === undefined ? 'text-gray-950' : good ? 'text-emerald-600' : 'text-amber-600'}`}>{value}</p></div> }
function Field({ label, value, onChange, placeholder, textarea }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; textarea?: boolean }) { return <label className="block"><span className="label">{label}</span>{textarea ? <textarea className="textarea min-h-20" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /> : <input className="input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}</label> }
function CaseCard({ item, onDelete, onToggle }: { item: Case; onDelete: () => void; onToggle: () => void }) { const latest = item.runs[0]; return <article className="card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2">{latest ? latest.passed ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-red-500" /> : <ShieldAlert className="h-5 w-5 text-gray-300" />}<h2 className="font-semibold text-gray-900">{item.name}</h2><button onClick={onToggle} className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{item.isActive ? 'Attivo' : 'Pausa'}</button></div><p className="mt-2 text-sm text-gray-600">“{item.question}”</p><div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className="rounded-md bg-gray-50 px-2 py-1 text-gray-500">Soglia {Math.round(item.minimumConfidence * 100)}%</span>{item.expectedKeywords.map(word => <span key={word} className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">Deve contenere: {word}</span>)}{item.forbiddenKeywords.map(word => <span key={word} className="rounded-md bg-red-50 px-2 py-1 text-red-600">Vietato: {word}</span>)}</div></div><button aria-label="Elimina caso" onClick={onDelete} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>{latest && <div className={`mt-4 rounded-xl border p-4 ${latest.passed ? 'border-emerald-100 bg-emerald-50/60' : 'border-red-100 bg-red-50/60'}`}><div className="flex flex-wrap justify-between gap-2 text-[10px]"><span className={latest.passed ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>{latest.passed ? 'SUPERATO' : 'NON SUPERATO'}</span><span className="text-gray-400">{latest.latencyMs || 0} ms · {latest.confidence == null ? 'confidenza non disponibile' : `${Math.round(latest.confidence * 100)}% confidenza`} · {new Date(latest.createdAt).toLocaleString('it-IT')}</span></div>{latest.failureReason && <p className="mt-2 text-xs text-red-700">{latest.failureReason}</p>}<p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-600">{latest.response || 'Nessuna risposta ricevuta.'}</p></div>}</article> }
