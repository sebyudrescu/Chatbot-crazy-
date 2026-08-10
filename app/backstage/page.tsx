'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrainCircuit, Check, ChevronRight, Download, FileSearch, FileUp, History, Loader2, MessageSquareText, Plus, RotateCcw, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import { SafeRichText } from '@/components/chat/SafeRichText'

type Bot = { id: string; companyName: string }
type Evidence = { type: string; label: string; value: string; href?: string }
type Message = { id: string; role: string; kind: string; content: string; evidence: Evidence[]; createdAt: string }
type Draft = { id: string; type: string; title: string; summary: string; payload: Record<string, unknown>; beforeState: Record<string, unknown>; evidence: Evidence[]; validation: { valid?: boolean; simulatedAt?: string; warnings?: string[]; checks?: string[]; effects?: string[] }; status: string; appliedResourceId?: string | null; createdAt: string }
type Session = { id: string; botId: string; title: string; updatedAt: string; messages: Message[]; drafts: Draft[]; _count?: { messages: number; drafts: number } }

const QUICK_PROMPTS = [
  'Analizza le ultime 100 conversazioni: temi, sentiment, problemi e opportunità.',
  'Trova risposte negative, domande senza risposta e suggerisci test di regressione.',
  'Controlla le fonti e segnala duplicati, errori o possibili contraddizioni.',
  'Rivedi istruzioni e configurazione dell’agente e proponi una bozza migliorata.',
  'Progetta una action per raccogliere lead interessati, senza attivarla.',
]

const TYPE_LABELS: Record<string, string> = { action: 'Action', workflow: 'Workflow', prompt: 'Prompt e impostazioni', knowledge_url: 'Fonte URL', evaluations: 'Evaluation' }

export default function BackstagePage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [botId, setBotId] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [upload, setUpload] = useState<{ file: File; preview: any } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/chatbots').then(response => response.json()).then(result => {
      const values = result.success ? result.data : []
      setBots(values)
      if (values[0]) setBotId(values[0].id)
    })
  }, [])

  const loadSession = useCallback(async (id: string) => {
    const response = await fetch(`/api/backstage/sessions/${id}`)
    const result = await response.json()
    if (result.success) setSession(result.data)
  }, [])

  const loadSessions = useCallback(async (selectedBotId: string) => {
    if (!selectedBotId) return
    const response = await fetch(`/api/backstage/sessions?botId=${selectedBotId}`)
    const result = await response.json()
    const values = result.success ? result.data : []
    setSessions(values)
    if (values[0]) await loadSession(values[0].id); else setSession(null)
  }, [loadSession])

  useEffect(() => { void loadSessions(botId) }, [botId, loadSessions])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [session?.messages.length, busy])

  async function createSession() {
    if (!botId) return null
    const response = await fetch('/api/backstage/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId }) })
    const result = await response.json()
    if (!result.success) throw new Error(result.error)
    setSession(result.data)
    await loadSessions(botId)
    return result.data as Session
  }

  async function send(text = message) {
    const clean = text.trim()
    if (!clean || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const active = session || await createSession()
      if (!active) throw new Error('Seleziona un agente')
      setSession(current => current ? { ...current, messages: [...current.messages, { id: `pending-${Date.now()}`, role: 'user', kind: 'message', content: clean, evidence: [], createdAt: new Date().toISOString() }] } : current)
      const response = await fetch('/api/backstage/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: active.id, message: clean }) })
      const result = await response.json()
      if (!result.success) throw new Error(result.error)
      await loadSession(active.id)
      await loadSessions(botId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Richiesta non riuscita') }
    finally { setBusy(false) }
  }

  async function operateDraft(draftId: string, operation: 'apply' | 'reject' | 'rollback' | 'simulate') {
    if (!session || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/backstage/drafts/${draftId}/${operation}`, { method: 'POST' })
      const result = await response.json()
      if (!result.success) throw new Error(result.error)
      await loadSession(session.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Operazione non riuscita') }
    finally { setBusy(false) }
  }

  async function saveDraft(draftId: string, payload: Record<string, unknown>) {
    if (!session || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/backstage/drafts/${draftId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }) })
      const result = await response.json()
      if (!result.success) throw new Error(result.error)
      await loadSession(session.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bozza non aggiornata') }
    finally { setBusy(false) }
  }

  async function previewDocument(file: File) {
    if (!botId) return
    setBusy(true); setError('')
    const form = new FormData(); form.set('botId', botId); form.set('file', file); form.set('previewOnly', 'true')
    try {
      const result = await fetch('/api/knowledge-sources/upload-document', { method: 'POST', body: form }).then(response => response.json())
      if (!result.success) throw new Error(result.error)
      setUpload({ file, preview: result.data })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Anteprima documento non riuscita') }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }

  async function approveDocument() {
    if (!upload || !botId) return
    setBusy(true); setError('')
    const form = new FormData(); form.set('botId', botId); form.set('file', upload.file)
    try {
      const result = await fetch('/api/knowledge-sources/upload-document', { method: 'POST', body: form }).then(response => response.json())
      if (!result.success) throw new Error(result.error)
      setUpload(null)
      setBusy(false)
      await send(`Documento approvato e aggiunto alla Knowledge Base: ${result.data.filename}, ${result.data.chunks} segmenti indicizzati. Analizzalo e dimmi come migliora l'agente.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Importazione non riuscita'); setBusy(false) }
  }

  function exportReport(item: Message) {
    const body = `# ${session?.title || 'Report LitX'}\n\n${item.content}\n\n## Evidenze\n${item.evidence.map(value => `- ${value.label}: ${value.value}`).join('\n')}\n`
    const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `litx-report-${new Date(item.createdAt).toISOString().slice(0, 10)}.md`; anchor.click(); URL.revokeObjectURL(url)
  }

  const selectedBot = bots.find(bot => bot.id === botId)
  const pendingDrafts = useMemo(() => session?.drafts.filter(draft => draft.status === 'draft') || [], [session])

  return <DashboardLayout><main className="mx-auto max-w-[1600px] p-4 lg:p-7">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="eyebrow">Owner-only operations</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-950"><BrainCircuit className="h-7 w-7 text-brand-600"/>Control Room AI</h1><p className="mt-1 max-w-3xl text-sm text-gray-500">Analizza dati reali, prepara modifiche e applicale soltanto dopo la tua approvazione. Ogni intervento è tracciato e reversibile.</p></div>
      <div className="flex flex-wrap gap-2"><select className="input min-w-64 text-sm" value={botId} onChange={event => setBotId(event.target.value)} aria-label="Agente da gestire">{bots.map(bot => <option key={bot.id} value={bot.id}>{bot.companyName}</option>)}</select><Button variant="secondary" onClick={() => void createSession()} icon={<Plus className="h-4 w-4"/>}>Nuova sessione</Button></div>
    </header>

    {error && <div className="mt-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError('')} aria-label="Chiudi errore"><X className="h-4 w-4"/></button></div>}

    <div className="mt-5 grid min-h-[720px] gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      <aside className="card flex max-h-[780px] flex-col overflow-hidden">
        <div className="border-b border-gray-100 p-4"><div className="flex items-center gap-2"><History className="h-4 w-4 text-brand-600"/><h2 className="text-sm font-semibold">Sessioni salvate</h2></div><p className="mt-1 text-[11px] text-gray-400">Riapri report e bozze in qualsiasi momento.</p></div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">{sessions.map(item => <button key={item.id} onClick={() => void loadSession(item.id)} className={`w-full rounded-xl px-3 py-3 text-left transition ${session?.id === item.id ? 'bg-brand-50 text-brand-800' : 'hover:bg-gray-50'}`}><p className="truncate text-xs font-semibold">{item.title}</p><p className="mt-1 text-[10px] text-gray-400">{new Date(item.updatedAt).toLocaleString('it-IT')} · {item._count?.drafts || 0} bozze</p></button>)}{!sessions.length && <Empty text="Nessuna sessione. Inizia con una richiesta."/>}</div>
        <div className="border-t border-gray-100 p-3"><input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.csv" className="hidden" onChange={event => event.target.files?.[0] && void previewDocument(event.target.files[0])}/><Button variant="secondary" fullWidth onClick={() => fileInput.current?.click()} icon={<FileUp className="h-4 w-4"/>}>Prepara documento</Button></div>
      </aside>

      <section className="card flex min-h-[720px] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="text-sm font-semibold text-gray-900">{session?.title || `Copilota di ${selectedBot?.companyName || 'LitX'}`}</h2><p className="mt-0.5 text-[10px] text-gray-400">Analisi → bozza → simulazione → approvazione → audit</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5"/>Nessuna modifica automatica</span></div>
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white to-gray-50/50 p-4 lg:p-6">
          {!session?.messages.length && <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-12 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-200"><Sparkles className="h-7 w-7"/></div><h3 className="mt-5 text-xl font-bold text-gray-950">Cosa vuoi capire o migliorare?</h3><p className="mt-2 text-sm text-gray-500">Il copilota userà solo dati dell’agente selezionato e preparerà bozze da approvare.</p><div className="mt-6 grid w-full gap-2 sm:grid-cols-2">{QUICK_PROMPTS.map(prompt => <button key={prompt} onClick={() => void send(prompt)} className="rounded-xl border border-gray-200 bg-white p-3 text-left text-xs text-gray-700 transition hover:border-brand-300 hover:bg-brand-50">{prompt}</button>)}</div></div>}
          <div className="space-y-4">{session?.messages.map(item => <article key={item.id} className={item.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[92%]'}><div className={item.role === 'user' ? 'rounded-2xl rounded-br-md bg-brand-600 px-4 py-3 text-sm text-white' : 'rounded-2xl rounded-bl-md border border-gray-100 bg-white px-5 py-4 text-sm leading-6 text-gray-700 shadow-sm'}>{item.role === 'assistant' ? <SafeRichText content={normalizeAssistantMarkdown(item.content)} /> : <p className="whitespace-pre-wrap">{item.content}</p>}{item.evidence.length > 0 && <div className="mt-4 border-t border-gray-100 pt-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Evidenze</p><div className="mt-2 flex flex-wrap gap-2">{item.evidence.map((value, index) => value.href ? <a key={`${value.label}-${index}`} href={value.href} className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-[10px] font-medium text-brand-700 hover:bg-brand-50">{value.label}: {value.value}</a> : <span key={`${value.label}-${index}`} className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-[10px] text-gray-600">{value.label}: {value.value}</span>)}</div></div>}{item.kind === 'report' && <button onClick={() => exportReport(item)} className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600"><Download className="h-3.5 w-3.5"/>Esporta report Markdown</button>}</div></article>)}{busy && <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="h-4 w-4 animate-spin text-brand-600"/>Il copilota sta verificando dati e vincoli…</div>}<div ref={endRef}/></div>
        </div>
        <div className="border-t border-gray-100 bg-white p-4"><div className="flex gap-2"><textarea value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} rows={2} placeholder="Chiedi un’analisi o descrivi la modifica da preparare…" className="input min-h-[54px] flex-1 resize-none py-3 text-sm"/><Button disabled={!message.trim()} loading={busy} onClick={() => void send()} aria-label="Invia richiesta" icon={<Send className="h-4 w-4"/>}>Invia</Button></div><p className="mt-2 text-[10px] text-gray-400">Invio non applica modifiche. Le bozze compaiono nel pannello a destra.</p></div>
      </section>

      <aside className="card max-h-[780px] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 p-4 backdrop-blur"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-brand-600"/><h2 className="text-sm font-semibold">Piano e approvazioni</h2></div>{pendingDrafts.length > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">{pendingDrafts.length} da approvare</span>}</div><p className="mt-1 text-[11px] text-gray-400">Controlla differenze, rischi e rollback.</p></div>
        <div className="space-y-3 p-3">{upload && <DocumentDraft upload={upload} busy={busy} onApprove={() => void approveDocument()} onReject={() => setUpload(null)}/>} {session?.drafts.map(draft => <DraftCard key={draft.id} draft={draft} busy={busy} onSave={payload => void saveDraft(draft.id, payload)} onOperation={operation => void operateDraft(draft.id, operation)}/>)}{!session?.drafts.length && !upload && <Empty text="Quando il copilota prepara una modifica, la vedrai qui prima che diventi effettiva."/>}</div>
      </aside>
    </div>
  </main></DashboardLayout>
}

function DraftCard({ draft, busy, onOperation, onSave }: { draft: Draft; busy: boolean; onOperation: (operation: 'apply' | 'reject' | 'rollback' | 'simulate') => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [json, setJson] = useState(() => JSON.stringify(draft.payload, null, 2))
  const [jsonError, setJsonError] = useState('')
  useEffect(() => setJson(JSON.stringify(draft.payload, null, 2)), [draft.payload])
  const status = draft.status === 'draft' ? 'Da approvare' : draft.status === 'applied' ? 'Applicata' : draft.status === 'rolled_back' ? 'Annullata' : 'Rifiutata'
  function save() { try { const value = JSON.parse(json); setJsonError(''); onSave(value); setEditing(false) } catch { setJsonError('JSON non valido') } }
  return <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><button onClick={() => setOpen(value => !value)} className="flex w-full items-start gap-3 p-4 text-left"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${draft.status === 'draft' ? 'bg-amber-50 text-amber-600' : draft.status === 'applied' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}><Sparkles className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="text-[9px] font-semibold uppercase tracking-wider text-brand-600">{TYPE_LABELS[draft.type] || draft.type}</span><span className="mt-0.5 block text-xs font-semibold text-gray-900">{draft.title}</span><span className="mt-1 block line-clamp-2 text-[11px] text-gray-500">{draft.summary}</span><span className="mt-2 inline-flex rounded-full bg-gray-50 px-2 py-1 text-[9px] font-semibold text-gray-600">{status}</span></span><ChevronRight className={`mt-2 h-4 w-4 text-gray-400 transition ${open ? 'rotate-90' : ''}`}/></button>{open && <div className="border-t border-gray-100 p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Anteprima modifica</p>{draft.status === 'draft' && <button onClick={() => setEditing(value => !value)} className="text-[10px] font-semibold text-brand-600">{editing ? 'Annulla modifica' : 'Modifica JSON'}</button>}</div>{editing ? <><textarea value={json} onChange={event => setJson(event.target.value)} className="mt-2 h-56 w-full rounded-xl bg-gray-950 p-3 font-mono text-[10px] leading-5 text-gray-200"/><div className="mt-2 flex items-center justify-between">{jsonError ? <p className="text-[10px] text-red-600">{jsonError}</p> : <span/>}<Button size="sm" onClick={save}>Salva bozza</Button></div></> : <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-gray-950 p-3 text-[10px] leading-5 text-gray-200">{JSON.stringify(draft.payload, null, 2)}</pre>}{Object.keys(draft.beforeState).length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[10px] font-semibold text-gray-500">Stato precedente e rollback</summary><pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-gray-50 p-3 text-[9px] text-gray-600">{JSON.stringify(draft.beforeState, null, 2)}</pre></details>}{draft.validation.effects && <div className="mt-3 rounded-xl bg-blue-50 p-3"><p className="text-[10px] font-semibold text-blue-800">Simulazione senza scritture</p>{draft.validation.effects.map(effect => <p key={effect} className="mt-1 text-[9px] text-blue-700">• {effect}</p>)}</div>}{draft.validation.warnings?.map(warning => <p key={warning} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] text-amber-700">{warning}</p>)}<div className="mt-3 flex flex-wrap gap-2">{draft.status === 'draft' && <><Button size="sm" variant="secondary" disabled={busy} onClick={() => onOperation('simulate')} icon={<ShieldCheck className="h-3.5 w-3.5"/>}>{draft.validation.simulatedAt ? 'Simula di nuovo' : 'Simula'}</Button><Button size="sm" loading={busy} disabled={!draft.validation.simulatedAt} onClick={() => onOperation('apply')} icon={<Check className="h-3.5 w-3.5"/>}>Approva e applica</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => onOperation('reject')} icon={<X className="h-3.5 w-3.5"/>}>Rifiuta</Button></>}{draft.status === 'applied' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => onOperation('rollback')} icon={<RotateCcw className="h-3.5 w-3.5"/>}>Rollback</Button>}</div></div>}</article>
}

function DocumentDraft({ upload, busy, onApprove, onReject }: { upload: { file: File; preview: any }; busy: boolean; onApprove: () => void; onReject: () => void }) {
  return <article className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4"><div className="flex items-center gap-2"><FileUp className="h-4 w-4 text-brand-600"/><p className="text-xs font-semibold">Importa {upload.preview.filename}</p></div><dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><dt className="text-gray-400">Parole</dt><dd className="font-semibold">{upload.preview.words}</dd></div><div><dt className="text-gray-400">Caratteri</dt><dd className="font-semibold">{upload.preview.characters}</dd></div></dl><p className="mt-3 line-clamp-4 whitespace-pre-wrap rounded-lg bg-white p-2 text-[9px] text-gray-500">{upload.preview.preview}</p><p className="mt-2 text-[9px] text-gray-500">Il file non è ancora nella Knowledge Base.</p><div className="mt-3 flex gap-2"><Button size="sm" loading={busy} onClick={onApprove} icon={<Check className="h-3.5 w-3.5"/>}>Approva importazione</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>Rifiuta</Button></div></article>
}

function Empty({ text }: { text: string }) { return <div className="px-4 py-12 text-center"><MessageSquareText className="mx-auto h-6 w-6 text-gray-300"/><p className="mt-2 text-[11px] leading-5 text-gray-400">{text}</p></div> }

function normalizeAssistantMarkdown(content: string) {
  return content.split('\n').map(line => {
    if (/^\s*\|?\s*:?-{3}/.test(line)) return ''
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.split('|').map(value => value.trim()).filter(Boolean)
      return cells.length ? `- ${cells.join(' — ')}` : ''
    }
    return line.replace(/^\s*#{1,6}\s+(.+)$/, '**$1**').replace(/^\s*>\s?/, '')
  }).join('\n')
}
