'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Check, Loader2, Search, Sparkles, X } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'

interface Template { id: string; name: string; description: string; category: string; icon: string; placeholders?: string[] }
const labels: Record<string, string> = { support: 'Assistenza', sales: 'Vendite', consulting: 'Consulenza', informative: 'Informazioni', educational: 'Formazione', technical: 'Tecnico', custom: 'Personalizzato' }

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([]), [category, setCategory] = useState('all'), [search, setSearch] = useState(''), [selected, setSelected] = useState<Template | null>(null)
  const [companyName, setCompanyName] = useState(''), [variables, setVariables] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { fetch('/api/prompt-templates').then(r => r.json()).then(result => setTemplates(result.data?.templates || [])) }, [])
  const categories = useMemo(() => ['all', ...Array.from(new Set(templates.map(item => item.category)))], [templates])
  const filtered = templates.filter(item => (category === 'all' || item.category === category) && `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase()))
  const useTemplate = async () => {
    if (!selected || !companyName.trim()) return
    setBusy(true); setError('')
    const response = await fetch('/api/templates/instantiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: selected.id, companyName, variables }) }); const result = await response.json()
    if (!response.ok) { setError(result.error || 'Creazione non riuscita'); setBusy(false); return }
    router.push(`/chatbot/${result.data.id}/onboarding`)
  }
  return <DashboardLayout><div className="mx-auto max-w-[1500px] p-4 lg:p-7">
    <div><p className="eyebrow">Avvio rapido</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Templates Marketplace</h1><p className="mt-1 text-sm text-gray-500">Crea un agente da una base professionale con workflow e test di sicurezza già pronti.</p></div>
    <div className="mt-6 card flex flex-wrap gap-3 p-4"><div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca un template..." /></div>{categories.map(item => <button key={item} onClick={() => setCategory(item)} className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${category === item ? 'bg-brand-600 text-white' : 'border bg-white text-gray-500'}`}>{item === 'all' ? 'Tutti' : labels[item] || item}</button>)}</div>
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(item => <article key={item.id} className="card flex flex-col p-5"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Sparkles className="h-5 w-5" /></div><div><span className="text-[9px] font-semibold uppercase tracking-wider text-brand-600">{labels[item.category] || item.category}</span><h2 className="text-sm font-semibold text-gray-900">{item.name}</h2></div></div><p className="mt-3 flex-1 text-[11px] leading-5 text-gray-500">{item.description}</p><div className="mt-4 space-y-2 border-t pt-4 text-[10px] text-gray-600"><Line text="System prompt professionale" /><Line text="Workflow lead e handoff" /><Line text="Test anti-allucinazione e sicurezza" /></div><Button className="mt-4" variant="secondary" onClick={() => { setSelected(item); setCompanyName(''); setVariables({}); setError('') }} icon={<Sparkles className="h-4 w-4" />}>Usa template</Button></article>)}</div>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-hard"><div className="flex items-start justify-between"><div><p className="eyebrow">Crea da template</p><h2 className="mt-1 text-xl font-bold">{selected.name}</h2><p className="mt-1 text-xs text-gray-500">Verranno creati anche workflow e controlli automatici.</p></div><button onClick={() => setSelected(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-4"><label className="block"><span className="label">Nome cliente o agente</span><input autoFocus className="input" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Es. Studio Rossi" /></label>{(selected.placeholders || []).filter(key => key !== 'COMPANY_NAME').map(key => <label key={key} className="block"><span className="label">{key.replaceAll('_', ' ')}</span><input className="input" value={variables[key] || ''} onChange={e => setVariables({ ...variables, [key]: e.target.value })} /></label>)}{error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}<div className="rounded-xl bg-brand-50 p-4 text-[11px] leading-5 text-brand-700"><Bot className="mb-2 h-4 w-4" />Dopo la creazione completerai fonti, aspetto e canali per il cliente.</div></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setSelected(null)}>Annulla</Button><Button onClick={useTemplate} disabled={busy || !companyName.trim()} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}>Crea agente</Button></div></div></div>}
  </div></DashboardLayout>
}
function Line({ text }: { text: string }) { return <div className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" />{text}</div> }
