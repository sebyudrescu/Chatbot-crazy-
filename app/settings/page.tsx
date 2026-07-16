'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle as TriangleAlert, Bot, CheckCircle2, Database, ExternalLink, KeyRound, Loader2, Server, ShieldCheck } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { PrivacyDataManager } from '@/components/settings/PrivacyDataManager'
import { RetentionPolicyManager } from '@/components/settings/RetentionPolicyManager'
import { KnowledgeSyncManager } from '@/components/settings/KnowledgeSyncManager'
import { OperationalMonitor } from '@/components/settings/OperationalMonitor'

interface Status {
  database: boolean
  openAI: boolean
  pinecone: boolean
  firecrawl: boolean
  accessProtection: boolean
  environment: string
  counts: { agents: number; sources: number; conversations: number }
  operations: Parameters<typeof OperationalMonitor>[0]['initialHealth'] | null
}

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null)
  useEffect(() => { fetch('/api/system/status').then(response => response.json()).then(result => setStatus(result.data)) }, [])

  return <DashboardLayout><div className="mx-auto max-w-6xl p-4 lg:p-7">
    <div><p className="eyebrow">Configurazione piattaforma</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Impostazioni di sistema</h1><p className="mt-1 text-sm text-gray-500">Stato reale dei servizi usati per costruire e gestire i chatbot dei clienti.</p></div>
    {!status ? <div className="card mt-6 flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div> : <>
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><Metric icon={Bot} label="Agenti" value={status.counts.agents} /><Metric icon={Database} label="Fonti" value={status.counts.sources} /><Metric icon={Server} label="Conversazioni" value={status.counts.conversations} /></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-5"><div className="flex items-center gap-2"><Server className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-semibold">Servizi collegati</h2></div><p className="mt-1 text-xs text-gray-500">Le chiavi restano sul server e non vengono mai mostrate nel browser.</p><div className="mt-5 divide-y">
          <Service name="Database Neon" detail="Agenti, fonti, chat, CRM e valutazioni" active={status.database} required />
          <Service name="OpenAI" detail="Risposte, embeddings e classificazione" active={status.openAI} required />
          <Service name="Pinecone" detail="Ricerca semantica persistente nella knowledge base" active={status.pinecone} />
          <Service name="Firecrawl" detail="Importazione avanzata di siti web" active={status.firecrawl} />
          <Service name="Protezione accesso" detail="Password privata dell’applicazione" active={status.accessProtection} required={status.environment === 'production'} />
        </div></section>
        <aside className="space-y-5"><div className="card p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-semibold">Sicurezza segreti</h2></div><p className="mt-3 text-xs leading-5 text-gray-600">Le credenziali vanno configurate esclusivamente nelle variabili protette del server. La piattaforma mostra soltanto se il servizio è collegato.</p><div className="mt-4 rounded-lg bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-700"><KeyRound className="mb-2 h-4 w-4" />Nessuna chiave API viene inviata al browser o salvata da questa pagina.</div></div>
          <div className="card p-5"><h2 className="text-sm font-semibold">Configurazione agenti</h2><p className="mt-2 text-xs leading-5 text-gray-500">Modello, tono, lingua, regole, system prompt e fallback si configurano separatamente per ciascun cliente.</p><Link href="/chatbots" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Apri gli agenti <ExternalLink className="h-3 w-3" /></Link></div>
          <div className={`rounded-xl border p-4 ${status.environment === 'production' && !status.accessProtection ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-gray-50 text-gray-600'}`}><p className="text-xs font-semibold">Ambiente: {status.environment}</p><p className="mt-1 text-[11px] leading-5">{status.environment === 'production' && !status.accessProtection ? 'Prima della pubblicazione abilita una protezione di accesso: l’app contiene dati dei clienti.' : 'Configurazione coerente con l’ambiente attuale.'}</p></div></aside>
      </div>
      <div className="mt-5"><PrivacyDataManager /></div>
      {status.operations ? <div className="mt-5"><OperationalMonitor initialHealth={status.operations} /></div> : null}
      <div className="mt-5"><RetentionPolicyManager /></div>
      <div className="mt-5"><KnowledgeSyncManager /></div>
    </>}
  </div></DashboardLayout>
}

function Metric({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: number }) { return <div className="card flex items-center gap-4 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></div><div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className="text-xl font-bold text-gray-950">{value}</p></div></div> }
function Service({ name, detail, active, required }: { name: string; detail: string; active: boolean; required?: boolean }) { return <div className="flex items-center gap-4 py-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-emerald-50 text-emerald-600' : required ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{active ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-gray-800">{name}</p><p className="mt-0.5 text-[10px] text-gray-500">{detail}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : required ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{active ? 'Collegato' : required ? 'Richiesto' : 'Opzionale'}</span></div> }
