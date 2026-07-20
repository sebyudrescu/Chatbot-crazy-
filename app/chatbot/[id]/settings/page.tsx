'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Bot, Check, ChevronLeft, FlaskConical, GitCompare, History, Loader2, MessageSquare, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Sparkles, UserRoundCheck, Wand2, X } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import { AI_MODEL_CATALOG, DEFAULT_CHAT_MODEL, normalizeAIModel } from '@/lib/ai-models'
import { appendAgentInstructions } from '@/lib/agent-instructions'

interface Template { id: string; name: string; description: string; category: string; systemPrompt: string }
interface AgentSettings {
  role?: string; objective?: string; personality?: string; rules?: string[]; language?: string; tone?: string
  forbiddenTopics?: string[]; forbiddenResponses?: string[]; handoffTriggers?: string[]; leadCollectionFields?: string[]
  responseLength?: 'short' | 'balanced' | 'detailed'; fallbackMessage?: string; handoffMessage?: string
  aiModel?: string; temperature?: number; maxTokens?: number
  primaryColor?: string; botName?: string; welcomeMessage?: string
}
interface Chatbot {
  id: string; companyName: string; promptTemplateId: string | null; systemPrompt: string | null
  promptVariables: Record<string, string> | null; settings: AgentSettings | null; isActive: boolean
}
interface PromptVersion { id: string; version: number; systemPrompt: string | null; promptTemplateId: string | null; settings: AgentSettings; changeSummary: string | null; createdAt: string }
interface Improvement { improvedPrompt: string; summary: string; changes: string[]; warnings: string[] }

const defaults: Required<Pick<AgentSettings, 'role' | 'objective' | 'personality' | 'rules' | 'forbiddenTopics' | 'forbiddenResponses' | 'handoffTriggers' | 'leadCollectionFields' | 'language' | 'tone' | 'responseLength' | 'fallbackMessage' | 'handoffMessage' | 'aiModel' | 'temperature' | 'maxTokens'>> = {
  role: '', objective: '', personality: '', rules: [], forbiddenTopics: [], forbiddenResponses: [], handoffTriggers: [], leadCollectionFields: [], language: 'Italiano', tone: 'Professionale ed empatico', responseLength: 'balanced',
  fallbackMessage: 'Non ho abbastanza informazioni per rispondere con precisione. Posso metterti in contatto con una persona del team?',
  handoffMessage: 'Questa richiesta richiede assistenza umana. Ho inoltrato la conversazione a un operatore, che potrà continuare da qui.',
  aiModel: DEFAULT_CHAT_MODEL, temperature: 0.3, maxTokens: 500,
}
const modelOptions: [string, string][] = AI_MODEL_CATALOG.map(model => [model.id, model.label])

export default function ChatbotSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const [bot, setBot] = useState<Chatbot | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [settings, setSettings] = useState<AgentSettings>(defaults)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [mode, setMode] = useState<'custom' | 'template'>('custom')
  const [newRule, setNewRule] = useState('')
  const [newForbiddenTopic, setNewForbiddenTopic] = useState('')
  const [newForbiddenResponse, setNewForbiddenResponse] = useState('')
  const [newHandoffTrigger, setNewHandoffTrigger] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [compare, setCompare] = useState<PromptVersion | null>(null)
  const [improving, setImproving] = useState(false)
  const [improvement, setImprovement] = useState<Improvement | null>(null)

  useEffect(() => {
    Promise.all([fetch(`/api/chatbots/${id}`).then(r => r.json()), fetch('/api/prompt-templates').then(r => r.json()), fetch(`/api/chatbots/${id}/prompt-versions`).then(r => r.json())])
      .then(([botResult, templateResult, versionResult]) => {
        if (!botResult.success) throw new Error(botResult.error)
        const loaded = botResult.data as Chatbot
        setBot(loaded)
        setSettings({ ...defaults, ...(loaded.settings || {}), aiModel: normalizeAIModel(loaded.settings?.aiModel) })
        setSystemPrompt(loaded.systemPrompt || '')
        setTemplateId(loaded.promptTemplateId)
        setMode(loaded.systemPrompt ? 'custom' : 'template')
        setTemplates(templateResult.data?.templates || [])
        setVersions(versionResult.data || [])
      })
      .catch(() => setNotice({ type: 'error', text: 'Impossibile caricare la configurazione.' }))
      .finally(() => setLoading(false))
  }, [id])

  const selectedTemplate = templates.find(template => template.id === templateId)
  const renderedPrompt = useMemo(() => {
    let value = mode === 'custom' ? systemPrompt : (selectedTemplate?.systemPrompt || '')
    const variables = { COMPANY_NAME: bot?.companyName || '', ...(bot?.promptVariables || {}) }
    Object.entries(variables).forEach(([key, replacement]) => { value = value.replace(new RegExp(`{{${key}}}`, 'g'), replacement) })
    return appendAgentInstructions(value, settings)
  }, [mode, systemPrompt, selectedTemplate, bot, settings])

  const update = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => setSettings(current => ({ ...current, [key]: value }))
  const addRule = () => {
    if (!newRule.trim()) return
    update('rules', [...(settings.rules || []), newRule.trim()])
    setNewRule('')
  }
  const addListItem = (key: 'forbiddenTopics' | 'forbiddenResponses' | 'handoffTriggers', value: string, clear: () => void) => {
    const item = value.trim()
    if (!item || (settings[key] || []).includes(item)) return
    update(key, [...(settings[key] || []), item])
    clear()
  }
  const toggleLeadField = (field: string) => update('leadCollectionFields', (settings.leadCollectionFields || []).includes(field)
    ? settings.leadCollectionFields?.filter(value => value !== field)
    : [...(settings.leadCollectionFields || []), field])

  const save = async () => {
    setSaving(true); setNotice(null)
    try {
      const response = await fetch(`/api/chatbots/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, promptTemplateId: mode === 'template' ? templateId : null, systemPrompt: mode === 'custom' ? systemPrompt : null }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setBot(result.data)
      const history = await fetch(`/api/chatbots/${id}/prompt-versions`).then(r => r.json())
      setVersions(history.data || [])
      setNotice({ type: 'success', text: 'Configurazione salvata e collegata al motore della chat.' })
    } catch { setNotice({ type: 'error', text: 'Salvataggio non riuscito. Controlla i valori e riprova.' }) }
    finally { setSaving(false) }
  }

  const improvePrompt = async () => {
    if (renderedPrompt.trim().length < 20) return setNotice({ type: 'error', text: 'Inserisci prima istruzioni sufficienti da migliorare.' })
    setImproving(true); setNotice(null)
    try {
      const response = await fetch('/api/prompt-improve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyName: bot?.companyName, prompt: renderedPrompt, role: settings.role, objective: settings.objective, rules: settings.rules || [], language: settings.language, tone: settings.tone }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setImprovement(result.data)
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Miglioramento AI non riuscito.' }) }
    finally { setImproving(false) }
  }

  const restoreVersion = async (version: PromptVersion) => {
    setSaving(true)
    const response = await fetch(`/api/chatbots/${id}/prompt-versions/${version.id}/restore`, { method: 'POST' })
    const result = await response.json()
    if (response.ok) {
      setBot(result.data); setSettings({ ...defaults, ...(result.data.settings || {}), aiModel: normalizeAIModel(result.data.settings?.aiModel) }); setSystemPrompt(result.data.systemPrompt || ''); setTemplateId(result.data.promptTemplateId); setMode(result.data.systemPrompt ? 'custom' : 'template')
      const history = await fetch(`/api/chatbots/${id}/prompt-versions`).then(r => r.json()); setVersions(history.data || []); setNotice({ type: 'success', text: `Versione ${version.version} ripristinata creando una nuova revisione.` })
    } else setNotice({ type: 'error', text: result.error || 'Ripristino non riuscito.' })
    setSaving(false)
  }

  if (loading) return <DashboardLayout><div className="flex min-h-[70vh] items-center justify-center text-sm text-gray-500">Caricamento configurazione...</div></DashboardLayout>
  if (!bot) return <DashboardLayout><div className="p-8 text-sm text-red-600">Agente non trovato.</div></DashboardLayout>

  return <DashboardLayout>
    <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/chatbots" aria-label="Torna agli agenti" className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:text-brand-600"><ChevronLeft className="h-4 w-4" /></Link>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Bot className="h-5 w-5" /></div>
          <div><div className="flex items-center gap-2"><h1 className="text-xl font-bold text-gray-950">{bot.companyName}</h1><span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">{bot.isActive ? 'Attivo' : 'In pausa'}</span></div><p className="text-xs text-gray-500">Configurazione completa dell&apos;AI Agent</p></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={improvePrompt} disabled={improving} icon={improving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}>Migliora con AI</Button><Button size="sm" variant="secondary" onClick={() => setShowHistory(value => !value)} icon={<History className="h-4 w-4" />}>Cronologia</Button><Link href={`/chat/${id}`} className="btn btn-secondary btn-sm"><FlaskConical className="h-4 w-4" />Testa agente</Link><Button size="sm" loading={saving} onClick={save} icon={<Save className="h-4 w-4" />}>Salva modifiche</Button></div>
      </div>

      <nav className="mb-5 flex gap-6 overflow-x-auto border-b border-gray-200 text-xs font-medium text-gray-500">
        <span className="whitespace-nowrap border-b-2 border-brand-600 px-1 pb-3 text-brand-700">Istruzioni</span>
        <Link href={`/chatbot/${id}/knowledge`} className="whitespace-nowrap border-b-2 border-transparent px-1 pb-3 hover:text-brand-700">Fonti</Link>
        <Link href={`/chatbot/${id}/embed`} className="whitespace-nowrap border-b-2 border-transparent px-1 pb-3 hover:text-brand-700">Aspetto e widget</Link>
        <Link href={`/chat/${id}`} className="whitespace-nowrap border-b-2 border-transparent px-1 pb-3 hover:text-brand-700">Test</Link>
        <Link href="/conversations" className="whitespace-nowrap border-b-2 border-transparent px-1 pb-3 hover:text-brand-700">Conversazioni</Link>
        <Link href="/analytics" className="whitespace-nowrap border-b-2 border-transparent px-1 pb-3 hover:text-brand-700">Analytics</Link>
      </nav>

      {notice && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div>}

      <div className="grid gap-5 xl:grid-cols-[190px_minmax(0,1fr)_350px]">
        <aside className="card h-fit p-2">
          {[['Identità', 'section-0'], ['System prompt', 'section-1'], ['Regole', 'section-2'], ['Comportamento', 'section-3'], ['Sicurezza', 'section-4'], ['Raccolta lead', 'section-5'], ['Modello AI', 'section-7']].map(([item, section], index) => <a key={section} href={`#${section}`} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium ${index === 0 ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50'}`}><SlidersHorizontal className="h-3.5 w-3.5" />{item}</a>)}
        </aside>

        <div className="space-y-5">
          <section id="section-0" className="card p-5"><p className="eyebrow">Identità</p><h2 className="mt-1 text-base font-semibold text-gray-950">Ruolo, obiettivo e personalità</h2><div className="mt-4 space-y-4"><Field label="Ruolo dell’agente"><textarea value={settings.role} onChange={e => update('role', e.target.value)} rows={3} placeholder="Es. Sei un consulente professionale esperto..." className="textarea" /></Field><Field label="Obiettivo"><textarea value={settings.objective} onChange={e => update('objective', e.target.value)} rows={3} placeholder="Quale risultato deve aiutare a raggiungere?" className="textarea" /></Field><Field label="Personalità"><textarea value={settings.personality} onChange={e => update('personality', e.target.value)} rows={3} placeholder="Es. Calmo, pratico, rassicurante e mai insistente..." className="textarea" /></Field></div></section>

          <section id="section-1" className="card p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">Istruzioni principali</p><h2 className="mt-1 text-base font-semibold text-gray-950">System prompt</h2></div><div className="flex rounded-lg bg-gray-100 p-1 text-xs"><button onClick={() => setMode('custom')} className={`rounded-md px-3 py-1.5 ${mode === 'custom' ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-gray-500'}`}>Personalizzato</button><button onClick={() => setMode('template')} className={`rounded-md px-3 py-1.5 ${mode === 'template' ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-gray-500'}`}>Template</button></div></div>
            {mode === 'custom' ? <Field label="Istruzioni complete" className="mt-4"><textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={13} placeholder="Definisci cosa deve fare l’agente, quali limiti rispettare e come deve rispondere..." className="textarea font-mono text-xs" /><p className="mt-1 text-right text-[10px] text-gray-400">{systemPrompt.length} caratteri</p></Field> : <Field label="Template di partenza" className="mt-4"><select value={templateId || ''} onChange={e => setTemplateId(e.target.value || null)} className="input"><option value="">Seleziona un template</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name} · {template.category}</option>)}</select><p className="mt-2 text-xs text-gray-500">{selectedTemplate?.description}</p></Field>}
          </section>

          <section id="section-2" className="card p-5"><p className="eyebrow">Regole</p><h2 className="mt-1 text-base font-semibold text-gray-950">Vincoli operativi</h2><div className="mt-4 space-y-2">{(settings.rules || []).map((rule, index) => <div key={`${rule}-${index}`} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" /><span className="flex-1">{rule}</span><button onClick={() => update('rules', settings.rules?.filter((_, current) => current !== index))} className="text-gray-400 hover:text-red-600">×</button></div>)}<div className="flex gap-2"><input value={newRule} onChange={e => setNewRule(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRule()} placeholder="Aggiungi una regola..." className="input" /><Button variant="secondary" size="sm" onClick={addRule}>Aggiungi</Button></div></div></section>

          <section id="section-3" className="card p-5"><p className="eyebrow">Comportamento</p><h2 className="mt-1 text-base font-semibold text-gray-950">Stile delle risposte</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><Select label="Lingua" value={settings.language} onChange={value => update('language', value)} options={['Italiano', 'Inglese', 'Spagnolo', 'Francese', 'Automatico']} /><Select label="Tono di voce" value={settings.tone} onChange={value => update('tone', value)} options={['Professionale ed empatico', 'Amichevole', 'Formale', 'Diretto', 'Commerciale']} /><Select label="Lunghezza" value={settings.responseLength} onChange={value => update('responseLength', value as AgentSettings['responseLength'])} options={[['short','Breve'], ['balanced','Equilibrata'], ['detailed','Dettagliata']]} /></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><Field label="Messaggio di fallback"><textarea value={settings.fallbackMessage} onChange={e => update('fallbackMessage', e.target.value)} rows={3} className="textarea" /></Field><Field label="Messaggio di passaggio a operatore"><textarea value={settings.handoffMessage} onChange={e => update('handoffMessage', e.target.value)} rows={3} className="textarea" /></Field></div></section>

          <section id="section-4" className="card p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-amber-50 p-2 text-amber-700"><ShieldCheck className="h-5 w-5" /></div><div><p className="eyebrow">Sicurezza e handoff</p><h2 className="mt-1 text-base font-semibold text-gray-950">Limiti e passaggio a operatore</h2><p className="mt-1 text-xs text-gray-500">Questi vincoli vengono aggiunti al prompt realmente inviato al modello.</p></div></div><div className="mt-5 grid gap-5 lg:grid-cols-3"><InstructionList label="Argomenti vietati" placeholder="Es. diagnosi mediche" values={settings.forbiddenTopics || []} input={newForbiddenTopic} setInput={setNewForbiddenTopic} onAdd={() => addListItem('forbiddenTopics', newForbiddenTopic, () => setNewForbiddenTopic(''))} onRemove={index => update('forbiddenTopics', settings.forbiddenTopics?.filter((_, current) => current !== index))} /><InstructionList label="Risposte vietate" placeholder="Es. promettere risultati garantiti" values={settings.forbiddenResponses || []} input={newForbiddenResponse} setInput={setNewForbiddenResponse} onAdd={() => addListItem('forbiddenResponses', newForbiddenResponse, () => setNewForbiddenResponse(''))} onRemove={index => update('forbiddenResponses', settings.forbiddenResponses?.filter((_, current) => current !== index))} /><InstructionList label="Quando passare a un operatore" placeholder="Es. cliente molto insoddisfatto" values={settings.handoffTriggers || []} input={newHandoffTrigger} setInput={setNewHandoffTrigger} onAdd={() => addListItem('handoffTriggers', newHandoffTrigger, () => setNewHandoffTrigger(''))} onRemove={index => update('handoffTriggers', settings.handoffTriggers?.filter((_, current) => current !== index))} /></div></section>

          <section id="section-5" className="card p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-brand-50 p-2 text-brand-700"><UserRoundCheck className="h-5 w-5" /></div><div><p className="eyebrow">Raccolta lead</p><h2 className="mt-1 text-base font-semibold text-gray-950">Dati che l’agente può richiedere</h2><p className="mt-1 text-xs text-gray-500">L’agente li chiederà soltanto quando pertinenti e con consenso esplicito.</p></div></div><div className="mt-4 flex flex-wrap gap-2">{['Nome', 'Email', 'Telefono', 'Azienda', 'Esigenza', 'Consenso privacy'].map(field => { const active = (settings.leadCollectionFields || []).includes(field); return <button key={field} type="button" aria-pressed={active} onClick={() => toggleLeadField(field)} className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:border-brand-200'}`}>{active && <Check className="mr-1.5 inline h-3.5 w-3.5" />}{field}</button> })}</div></section>

          <section id="section-7" className="card p-5"><p className="eyebrow">Avanzate</p><h2 className="mt-1 text-base font-semibold text-gray-950">Modello AI</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><div><Select label="Modello" value={settings.aiModel} onChange={value => update('aiModel', value)} options={modelOptions} /><p className="mt-1.5 text-[10px] leading-4 text-gray-500">{AI_MODEL_CATALOG.find(model => model.id === settings.aiModel)?.description}</p></div><Field label={`Creatività · ${settings.temperature}`}><input aria-label="Creatività" type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={e => update('temperature', Number(e.target.value))} className="mt-3 w-full accent-brand-600" /></Field><Field label="Token massimi"><input type="number" min="64" max="4096" value={settings.maxTokens} onChange={e => update('maxTokens', Number(e.target.value))} className="input" /></Field></div></section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-20 xl:h-fit">
          <div className="card overflow-hidden"><div className="border-b border-gray-100 px-4 py-3"><p className="text-xs font-semibold text-gray-900">Anteprima agente</p></div><div className="p-4"><div className="overflow-hidden rounded-2xl border border-gray-200 shadow-soft"><div className="flex items-center gap-2 bg-gradient-to-r from-brand-700 to-brand-500 px-4 py-3 text-white"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20"><Sparkles className="h-4 w-4" /></div><div><p className="text-xs font-semibold">{settings.botName || bot.companyName}</p><p className="text-[9px] text-white/75">Online</p></div></div><div className="min-h-56 bg-gray-50 p-4"><div className="max-w-[85%] rounded-xl rounded-tl-sm bg-white p-3 text-xs leading-5 text-gray-700 shadow-sm">{settings.welcomeMessage || `Ciao! Sono l’assistente di ${bot.companyName}. Come posso aiutarti oggi?`}</div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-lg border bg-white px-2.5 py-1.5 text-[10px] text-brand-700">Informazioni</span><span className="rounded-lg border bg-white px-2.5 py-1.5 text-[10px] text-brand-700">Parla con il team</span></div></div><div className="flex items-center gap-2 border-t bg-white p-3"><span className="flex-1 text-[10px] text-gray-400">Scrivi qui il tuo messaggio...</span><MessageSquare className="h-4 w-4 text-brand-600" /></div></div></div></div>
          <div className="card p-4"><p className="text-xs font-semibold text-gray-900">Prompt finale</p><p className="mt-1 text-[10px] text-gray-400">Anteprima della base inviata al modello</p><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-950 p-3 text-[10px] leading-5 text-gray-200">{renderedPrompt || 'Inserisci un system prompt o scegli un template.'}</pre></div>
          {showHistory && <div className="card p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold">Cronologia prompt</p><p className="mt-1 text-[9px] text-gray-400">{versions.length} revisioni salvate</p></div><History className="h-4 w-4 text-brand-600" /></div><div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{versions.map(version => <div key={version.id} className="rounded-lg border bg-gray-50 p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold text-gray-700">Versione {version.version}</span><span className="text-[8px] text-gray-400">{new Date(version.createdAt).toLocaleString('it-IT')}</span></div><p className="mt-1 text-[9px] text-gray-500">{version.changeSummary || 'Configurazione salvata'}</p><div className="mt-2 flex gap-1"><button onClick={() => setCompare(version)} className="flex items-center gap-1 rounded bg-white px-2 py-1 text-[9px] font-semibold text-gray-500"><GitCompare className="h-3 w-3" />Confronta</button><button onClick={() => restoreVersion(version)} className="flex items-center gap-1 rounded bg-white px-2 py-1 text-[9px] font-semibold text-brand-600"><RotateCcw className="h-3 w-3" />Ripristina</button></div></div>)}{!versions.length && <p className="rounded-lg bg-gray-50 p-4 text-[10px] text-gray-400">La prima versione verrà creata al prossimo salvataggio.</p>}</div></div>}
        </aside>
      </div>
    </div>
    {improvement && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm"><div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b p-5"><div><p className="eyebrow">Proposta AI</p><h2 className="mt-1 text-xl font-bold">Miglioramento del system prompt</h2><p className="mt-1 text-xs text-gray-500">{improvement.summary}</p></div><button onClick={() => setImprovement(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div><div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-2"><div><p className="label">Prompt attuale</p><pre className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-100 p-4 text-[10px] leading-5 text-gray-600">{renderedPrompt}</pre></div><div><p className="label">Prompt migliorato</p><pre className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-950 p-4 text-[10px] leading-5 text-gray-200">{improvement.improvedPrompt}</pre></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-800">Modifiche proposte</p><ul className="mt-2 space-y-1 text-[10px] text-emerald-700">{improvement.changes.map(change => <li key={change}>• {change}</li>)}</ul></div>{improvement.warnings.length > 0 && <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-800">Da verificare</p><ul className="mt-2 space-y-1 text-[10px] text-amber-700">{improvement.warnings.map(warning => <li key={warning}>• {warning}</li>)}</ul></div>}</div><div className="flex justify-end gap-2 border-t p-4"><Button variant="secondary" onClick={() => setImprovement(null)}>Mantieni attuale</Button><Button onClick={() => { setMode('custom'); setSystemPrompt(improvement.improvedPrompt); setImprovement(null); setNotice({ type: 'success', text: 'Proposta applicata in bozza. Salva per creare una nuova versione.' }) }} icon={<Check className="h-4 w-4" />}>Applica in bozza</Button></div></div></div>}
    {compare && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm"><div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><p className="eyebrow">Confronto</p><h2 className="mt-1 text-lg font-bold">Versione {compare.version} vs configurazione corrente</h2></div><button onClick={() => setCompare(null)} className="rounded-lg p-2 text-gray-400"><X className="h-4 w-4" /></button></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><p className="label">Versione {compare.version}</p><pre className="mt-2 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-100 p-4 text-[10px] leading-5">{compare.systemPrompt || `Template: ${compare.promptTemplateId}`}</pre></div><div><p className="label">Corrente</p><pre className="mt-2 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-950 p-4 text-[10px] leading-5 text-gray-200">{renderedPrompt}</pre></div></div><div className="mt-4 flex justify-end"><Button onClick={() => { restoreVersion(compare); setCompare(null) }} icon={<RotateCcw className="h-4 w-4" />}>Ripristina questa versione</Button></div></div></div>}
  </DashboardLayout>
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-medium text-gray-700">{label}</span>{children}</label> }
function Select({ label, value, onChange, options }: { label: string; value?: string; onChange: (value: string) => void; options: (string | [string, string])[] }) { return <Field label={label}><select value={value || ''} onChange={event => onChange(event.target.value)} className="input">{options.map(option => { const [value, label] = Array.isArray(option) ? option : [option, option]; return <option key={value} value={value}>{label}</option> })}</select></Field> }
function InstructionList({ label, placeholder, values, input, setInput, onAdd, onRemove }: { label: string; placeholder: string; values: string[]; input: string; setInput: (value: string) => void; onAdd: () => void; onRemove: (index: number) => void }) {
  return <div><p className="text-xs font-semibold text-gray-800">{label}</p><div className="mt-2 space-y-2">{values.map((value, index) => <div key={`${value}-${index}`} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-[11px] text-gray-700"><span className="flex-1 leading-4">{value}</span><button type="button" onClick={() => onRemove(index)} aria-label={`Rimuovi ${value}`} className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600">×</button></div>)}</div><div className="mt-2 flex gap-2"><input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onAdd() } }} placeholder={placeholder} className="input min-w-0" /><Button type="button" variant="secondary" size="sm" onClick={onAdd}>Aggiungi</Button></div></div>
}
