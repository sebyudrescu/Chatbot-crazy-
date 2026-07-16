'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Bot, Check, ShieldCheck, Sparkles, X } from 'lucide-react'
import { AI_MODEL_CATALOG, DEFAULT_CHAT_MODEL, type SupportedAIModel } from '@/lib/ai-models'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import PromptTemplateSelector from './PromptTemplateSelector'

interface AgentCreationWizardProps {
  open: boolean
  onClose: () => void
  onCreated: (agentId: string) => void
}

type ResponseLength = 'short' | 'balanced' | 'detailed'

const steps = [
  { title: 'Identità', description: 'Cliente e obiettivo' },
  { title: 'Istruzioni', description: 'System prompt' },
  { title: 'Comportamento', description: 'Modello e revisione' },
] as const

const initialRules = [
  'Non inventare informazioni, prezzi o disponibilità',
  'Usa solo le fonti autorizzate',
  'Chiedi il consenso prima di raccogliere dati personali',
]

export function AgentCreationWizard({ open, onClose, onCreated }: AgentCreationWizardProps) {
  const [step, setStep] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [role, setRole] = useState('')
  const [objective, setObjective] = useState('')
  const [language, setLanguage] = useState('Italiano')
  const [tone, setTone] = useState('Professionale ed empatico')
  const [responseLength, setResponseLength] = useState<ResponseLength>('balanced')
  const [aiModel, setAiModel] = useState<SupportedAIModel>(DEFAULT_CHAT_MODEL)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [customPrompt, setCustomPrompt] = useState<string | null>(null)
  const [promptVariables, setPromptVariables] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [creating, onClose, open])

  const instructionReady = Boolean(selectedTemplateId || (customPrompt && customPrompt.trim().length >= 40))
  const identityReady = companyName.trim().length >= 2 && role.trim().length >= 3 && objective.trim().length >= 10
  const currentReady = step === 0 ? identityReady : step === 1 ? instructionReady : true
  const model = AI_MODEL_CATALOG.find(item => item.id === aiModel) || AI_MODEL_CATALOG[0]
  const instructionLabel = selectedTemplateId ? 'Template professionale' : 'System prompt personalizzato'

  const reset = () => {
    setStep(0)
    setError('')
    setCompanyName('')
    setRole('')
    setObjective('')
    setLanguage('Italiano')
    setTone('Professionale ed empatico')
    setResponseLength('balanced')
    setAiModel(DEFAULT_CHAT_MODEL)
    setSelectedTemplateId(null)
    setCustomPrompt(null)
    setPromptVariables({})
  }

  const close = () => {
    if (creating) return
    reset()
    onClose()
  }

  const next = () => {
    if (!currentReady) {
      setError(step === 0
        ? 'Completa nome, ruolo e obiettivo prima di continuare.'
        : 'Scegli un template oppure scrivi un system prompt di almeno 40 caratteri.')
      return
    }
    setError('')
    setStep(value => Math.min(value + 1, steps.length - 1))
  }

  const create = async () => {
    if (!identityReady || !instructionReady) return
    setCreating(true)
    setError('')
    try {
      const response = await fetch('/api/chatbots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          promptTemplateId: selectedTemplateId,
          systemPrompt: selectedTemplateId ? null : customPrompt?.trim(),
          promptVariables,
          settings: {
            role: role.trim(),
            objective: objective.trim(),
            language,
            tone,
            responseLength,
            aiModel,
            temperature: 0.3,
            maxTokens: 700,
            fallbackMessage: 'Non ho abbastanza informazioni verificate. Posso passarti a una persona del team.',
            rules: initialRules,
          },
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.data?.id) throw new Error(result.error || 'Impossibile creare l’agente')
      const agentId = result.data.id as string
      reset()
      onCreated(agentId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Creazione non riuscita')
    } finally {
      setCreating(false)
    }
  }

  const reviewItems = [
    ['Cliente / agente', companyName],
    ['Ruolo', role],
    ['Obiettivo', objective],
    ['Istruzioni', instructionLabel],
    ['Lingua e tono', `${language} · ${tone}`],
    ['Modello AI', model.label],
  ]

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-3 backdrop-blur-sm sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="agent-wizard-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-hard">
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <p className="eyebrow">Nuovo progetto cliente</p>
            <h2 id="agent-wizard-title" className="mt-1 text-xl font-bold text-gray-950 sm:text-2xl">Crea un AI Agent da zero</h2>
            <p className="mt-1 text-xs text-gray-500">Configurazione guidata; l’agente resterà in bozza fino alla pubblicazione.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={close} disabled={creating} icon={<X className="h-5 w-5" />} aria-label="Chiudi creazione agente" />
        </header>

        <nav aria-label="Avanzamento creazione agente" className="grid grid-cols-3 border-b border-gray-100 bg-gray-50/70 px-4 sm:px-7">
          {steps.map((item, index) => {
            const active = index === step
            const done = index < step
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => index < step && setStep(index)}
                disabled={index > step || creating}
                className={`flex items-center gap-2 border-b-2 px-2 py-3 text-left transition sm:py-4 ${active ? 'border-brand-600 text-brand-700' : done ? 'border-transparent text-emerald-700' : 'border-transparent text-gray-400'}`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${active ? 'bg-brand-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>{done ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                <span className="hidden sm:block"><span className="block text-xs font-semibold">{item.title}</span><span className="block text-[9px] opacity-70">{item.description}</span></span>
              </button>
            )
          })}
        </nav>

        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {step === 0 && (
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="rounded-xl border border-brand-100 bg-brand-50 p-4"><div className="flex items-start gap-3"><Bot className="mt-0.5 h-5 w-5 text-brand-600" /><div><p className="text-xs font-semibold text-brand-900">Partiamo dal lavoro che deve svolgere</p><p className="mt-1 text-[11px] leading-5 text-brand-700">Usa un nome riconoscibile per il cliente e descrivi risultato e responsabilità dell’agente.</p></div></div></div>
              <Input label="Nome cliente o agente" value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Es. Assistente Nutrizionista · Studio Rossi" disabled={creating} required autoFocus />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Ruolo dell’agente" required><textarea value={role} onChange={event => setRole(event.target.value)} rows={5} placeholder="Es. Consulente virtuale che presenta i servizi e qualifica le richieste..." className="textarea" disabled={creating} /></Field>
                <Field label="Obiettivo principale" required><textarea value={objective} onChange={event => setObjective(event.target.value)} rows={5} placeholder="Es. Rispondere con precisione, raccogliere lead e proporre una consulenza..." className="textarea" disabled={creating} /></Field>
              </div>
              <Field label="Lingua principale"><select value={language} onChange={event => setLanguage(event.target.value)} className="input" disabled={creating}><option>Italiano</option><option>Inglese</option><option>Spagnolo</option><option>Francese</option><option>Automatico</option></select></Field>
            </div>
          )}

          {step === 1 && (
            <div className="mx-auto max-w-4xl">
              <div className="mb-5 rounded-xl border border-violet-100 bg-violet-50 p-4"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-violet-600" /><div><p className="text-xs font-semibold text-violet-900">Definisci il system prompt</p><p className="mt-1 text-[11px] leading-5 text-violet-700">Parti da un template collaudato oppure scrivi istruzioni completamente personalizzate.</p></div></div></div>
              <PromptTemplateSelector selectedTemplateId={selectedTemplateId} customPrompt={customPrompt} promptVariables={promptVariables} companyName={companyName} onTemplateChange={setSelectedTemplateId} onCustomPromptChange={setCustomPrompt} onVariablesChange={setPromptVariables} disabled={creating} />
            </div>
          )}

          {step === 2 && (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="card p-5">
                  <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600" /><h3 className="text-sm font-semibold text-gray-900">Comportamento AI</h3></div>
                  <div className="mt-4 space-y-4">
                    <Field label="Modello"><select value={aiModel} onChange={event => setAiModel(event.target.value as SupportedAIModel)} className="input" disabled={creating}>{AI_MODEL_CATALOG.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><p className="mt-1 text-[10px] leading-4 text-gray-500">{model.description}</p></Field>
                    <Field label="Tono di voce"><select value={tone} onChange={event => setTone(event.target.value)} className="input" disabled={creating}><option>Professionale ed empatico</option><option>Amichevole</option><option>Formale</option><option>Diretto</option><option>Commerciale</option></select></Field>
                    <Field label="Lunghezza risposte"><select value={responseLength} onChange={event => setResponseLength(event.target.value as ResponseLength)} className="input" disabled={creating}><option value="short">Breve</option><option value="balanced">Equilibrata</option><option value="detailed">Dettagliata</option></select></Field>
                  </div>
                </div>
                <div className="card p-5">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /><h3 className="text-sm font-semibold text-gray-900">Sicurezza iniziale</h3></div>
                  <div className="mt-4 space-y-2">{initialRules.map(rule => <div key={rule} className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-[11px] leading-4 text-emerald-800"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />{rule}</div>)}</div>
                  <p className="mt-3 text-[10px] leading-4 text-gray-500">Potrai modificare queste regole nelle impostazioni avanzate.</p>
                </div>
              </div>
              <div className="card overflow-hidden"><div className="border-b bg-gray-50 px-5 py-3"><p className="text-xs font-semibold text-gray-900">Revisione configurazione</p></div><dl className="divide-y divide-gray-100">{reviewItems.map(([label, value]) => <div key={label} className="grid gap-1 px-5 py-3 sm:grid-cols-[160px_1fr]"><dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</dt><dd className="text-xs leading-5 text-gray-700">{value}</dd></div>)}</dl></div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[11px] leading-5 text-amber-800"><strong>Stato iniziale: bozza.</strong> Dopo la creazione completerai fonti, test automatici, widget e pubblicazione dalla checklist guidata.</div>
            </div>
          )}

          {error && <div role="alert" className="mx-auto mt-5 max-w-4xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
        </div>

        <footer className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-7">
          <div className="text-[10px] text-gray-400">Passaggio {step + 1} di {steps.length}</div>
          <div className="flex gap-2">
            {step > 0 && <Button variant="secondary" onClick={() => { setError(''); setStep(value => value - 1) }} disabled={creating} icon={<ArrowLeft className="h-4 w-4" />}>Indietro</Button>}
            {step < steps.length - 1
              ? <Button onClick={next} disabled={creating} icon={<ArrowRight className="h-4 w-4" />}>Continua</Button>
              : <Button onClick={create} loading={creating} disabled={!identityReady || !instructionReady} icon={!creating ? <Sparkles className="h-4 w-4" /> : undefined}>Crea agente in bozza</Button>}
          </div>
        </footer>
      </section>
    </div>
  )
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-700">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>{children}</label>
}
