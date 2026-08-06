'use client'

import { memo, useCallback, useDeferredValue, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AlertTriangle, Box, CheckCircle2, ChevronLeft, ChevronRight, Copy, ExternalLink, ImageOff, KeyRound, MousePointerClick, PackageSearch, RefreshCw, Sparkles } from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

type RecommendationStatus = 'normal' | 'promoted' | 'excluded' | 'blocked'

interface Agent { id: string; companyName: string }
interface Variant { id: string; sku?: string | null; title?: string | null; price?: number | null; currency?: string | null; available: boolean }
interface Product {
  id: string
  title: string
  description: string
  brand?: string | null
  canonicalUrl: string
  mainImageUrl?: string | null
  availableForSale: boolean
  recommendationStatus: RecommendationStatus
  rankingBoost: number
  merchandisingNote?: string | null
  variants: Variant[]
  source?: { name: string; sourceType: string } | null
  updatedAt: string
}
interface CommerceData {
  summary: { total: number; active: number; incomplete: number; events: Record<string, number> }
  sources: Array<{ id: string; name: string; sourceType: string; status: string; lastSyncAt?: string | null; _count: { products: number } }>
  products: Product[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

const STATUS_LABELS: Record<RecommendationStatus, string> = {
  normal: 'Normale', promoted: 'Promosso', excluded: 'Escluso', blocked: 'Bloccato',
}

const ProductRow = memo(function ProductRow({ product, botId, onSaved }: { product: Product; botId: string; onSaved: () => void }) {
  const [status, setStatus] = useState<RecommendationStatus>(product.recommendationStatus)
  const [boost, setBoost] = useState(product.rankingBoost)
  const [note, setNote] = useState(product.merchandisingNote || '')
  const [saving, setSaving] = useState(false)
  const primaryVariant = product.variants.find(variant => variant.available) || product.variants[0]
  const formattedPrice = primaryVariant?.price != null
    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: primaryVariant.currency || 'EUR' }).format(primaryVariant.price)
    : 'Prezzo non rilevato'

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/commerce/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, recommendationStatus: status, rankingBoost: boost, merchandisingNote: note || null }),
      })
      if (!response.ok) throw new Error('Salvataggio non riuscito')
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <article className="grid gap-4 border-b border-gray-100 p-4 last:border-0 lg:grid-cols-[72px_minmax(0,1fr)_minmax(290px,0.7fr)] lg:items-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
        {product.mainImageUrl ? <Image src={product.mainImageUrl} alt="" width={72} height={72} unoptimized className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-gray-300" />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-gray-950">{product.title}</h2>
          {status === 'promoted' ? <span className="rounded-full bg-brand-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-brand-700">Promosso</span> : null}
          {!product.availableForSale ? <span className="rounded-full bg-red-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-red-700">Non disponibile</span> : null}
        </div>
        <p className="mt-1 text-xs font-semibold text-gray-700">{formattedPrice}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-gray-500">{product.description || 'Descrizione mancante: controlla la pagina prodotto.'}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-gray-400">
          <span>{product.brand || 'Brand non rilevato'}</span><span>{product.variants.length} varianti</span><span>{product.source?.name || 'Fonte catalogo'}</span>
          <a href={product.canonicalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">Apri prodotto <ExternalLink className="h-3 w-3" /></a>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
        <label className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Raccomandazione
          <select value={status} onChange={event => setStatus(event.target.value as RecommendationStatus)} className="input mt-1 py-2 text-xs">
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Priorità
          <input type="number" min={-100} max={100} value={boost} onChange={event => setBoost(Number(event.target.value))} className="input mt-1 py-2 text-xs" />
        </label>
        <Button size="sm" loading={saving} onClick={save} className="self-end">Salva</Button>
        <label className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 sm:col-span-3">Nota verificata per l’AI
          <input value={note} maxLength={500} onChange={event => setNote(event.target.value)} placeholder="Es. Ideale per uso quotidiano; non consigliare per esterni." className="input mt-1 py-2 text-xs" />
        </label>
      </div>
    </article>
  )
})

export default function CommercePage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [botId, setBotId] = useState('')
  const [data, setData] = useState<CommerceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(search.trim())

  useEffect(() => {
    let active = true
    fetch('/api/chatbots').then(response => response.json()).then(result => {
      if (!active) return
      const list = result.success ? result.data : []
      setAgents(list)
      setBotId((current) => current || list[0]?.id || '')
    }).catch(() => setError('Impossibile caricare gli agenti'))
    return () => { active = false }
  }, [])

  const loadCatalog = useCallback(async () => {
    if (!botId) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ botId, page: String(page), pageSize: '20' })
      if (deferredSearch) params.set('search', deferredSearch)
      const response = await fetch(`/api/commerce?${params.toString()}`)
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Catalogo non disponibile')
      setData(result.data)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Catalogo non disponibile') }
    finally { setLoading(false) }
  }, [botId, deferredSearch, page])

  useEffect(() => { void loadCatalog() }, [loadCatalog])

  const syncPlatform = async (provider: 'shopify' | 'woocommerce') => {
    if (!botId) return
    setSyncing(provider); setError('')
    try {
      const response = await fetch('/api/commerce/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId, provider }) })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || 'Sincronizzazione non riuscita')
      await loadCatalog()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sincronizzazione non riuscita') }
    finally { setSyncing(null) }
  }

  const products = data?.products || []
  const summary = data?.summary

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] p-4 lg:p-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="eyebrow">Commerce intelligence</p><h1 className="mt-1 text-2xl font-bold text-gray-950">Catalogo prodotti</h1><p className="mt-1 max-w-2xl text-sm text-gray-500">Prodotti verificati dal crawler, regole di raccomandazione e segnali di conversione del chatbot.</p></div>
          <div className="flex gap-2"><select value={botId} onChange={event => { setBotId(event.target.value); setPage(1) }} className="input min-w-52 py-2 text-xs" aria-label="Seleziona agente">{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.companyName}</option>)}</select><Button variant="secondary" size="sm" onClick={loadCatalog} icon={<RefreshCw className="h-4 w-4" />}>Aggiorna</Button></div>
        </div>

        {error ? <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />{error}</div> : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Prodotti importati" value={summary?.total || 0} icon={<Box className="h-4 w-4" />} />
          <Metric label="Disponibili" value={summary?.active || 0} icon={<CheckCircle2 className="h-4 w-4" />} />
          <Metric label="Dati incompleti" value={summary?.incomplete || 0} icon={<AlertTriangle className="h-4 w-4" />} />
          <Metric label="Click prodotto" value={summary?.events.click || 0} icon={<MousePointerClick className="h-4 w-4" />} />
          <Metric label="Vendite attribuite" value={summary?.events.conversion || 0} icon={<Sparkles className="h-4 w-4" />} />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card padding="none" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-gray-950">Prodotti verificati</h2><p className="mt-1 text-[10px] text-gray-400">Il modello non può modificare link, immagini, prezzo o stock.</p></div><input value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Cerca titolo, brand o SKU…" className="input max-w-sm py-2 text-xs" aria-label="Cerca nel catalogo" /></div>
            {loading ? <div className="p-12 text-center text-sm text-gray-400">Caricamento catalogo…</div> : products.length ? products.map(product => <ProductRow key={product.id} product={product} botId={botId} onSaved={loadCatalog} />) : <div className="p-12 text-center"><PackageSearch className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-3 text-sm font-semibold text-gray-700">Nessun prodotto trovato</p><p className="mt-1 text-xs text-gray-400">Esegui il crawling di un e-commerce con dati Product/Offer per popolare il catalogo.</p></div>}
            {data?.pagination && data.pagination.total > 0 ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3"><p className="text-[10px] text-gray-400">Prodotti {(data.pagination.page - 1) * data.pagination.pageSize + 1}-{Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} di {data.pagination.total.toLocaleString('it-IT')}</p><div className="flex items-center gap-2"><Button size="sm" variant="secondary" disabled={loading || data.pagination.page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))} icon={<ChevronLeft className="h-3.5 w-3.5" />}>Precedente</Button><span className="min-w-16 text-center text-[10px] font-semibold text-gray-500">{data.pagination.page} / {data.pagination.totalPages}</span><Button size="sm" variant="secondary" disabled={loading || data.pagination.page >= data.pagination.totalPages} onClick={() => setPage(current => current + 1)}>Successiva <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div></div> : null}
          </Card>
          <aside className="space-y-4">
            <Card><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-semibold">Fonti catalogo</h2></div><div className="mt-4 grid grid-cols-2 gap-2"><Button size="sm" variant="secondary" loading={syncing === 'shopify'} disabled={Boolean(syncing)} onClick={() => syncPlatform('shopify')}>Sync Shopify</Button><Button size="sm" variant="secondary" loading={syncing === 'woocommerce'} disabled={Boolean(syncing)} onClick={() => syncPlatform('woocommerce')}>Sync Woo</Button></div><Link href="/integrations" className="mt-2 block text-center text-[10px] font-semibold text-brand-600 hover:underline">Configura integrazioni</Link><div className="mt-4 space-y-3">{data?.sources.length ? data.sources.map(source => <div key={source.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-gray-800">{source.name}</p><span className="text-[9px] font-bold uppercase text-emerald-600">{source.status}</span></div><p className="mt-1 text-[10px] text-gray-400">{source.sourceType} · {source._count.products} prodotti</p></div>) : <p className="text-xs leading-5 text-gray-400">Le fonti JSON-LD appariranno automaticamente dopo il crawling.</p>}</div></Card>
            <Card><h2 className="text-sm font-semibold">Come funziona il ranking</h2><ul className="mt-3 space-y-2 text-[11px] leading-5 text-gray-500"><li>• I prodotti bloccati o esclusi non vengono mostrati.</li><li>• Disponibilità e pertinenza vengono prima della promozione.</li><li>• La priorità modifica l’ordine senza inventare dati.</li><li>• La nota è contesto verificato per spiegare il consiglio.</li></ul></Card>
            <ConversionTrackingCard botId={botId} />
          </aside>
        </div>
      </div>
    </DashboardLayout>
  )
}

function ConversionTrackingCard({ botId }: { botId: string }) {
  const [keyId, setKeyId] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!botId) return
    let active = true
    setSecret(''); setKeyId('')
    fetch(`/api/commerce/tracking-key?botId=${encodeURIComponent(botId)}`).then(response => response.json()).then(result => { if (active) setKeyId(result.data?.keyId || '') })
    return () => { active = false }
  }, [botId])
  const rotate = async () => {
    if (!botId) return
    setBusy(true)
    try {
      const response = await fetch('/api/commerce/tracking-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generazione chiave non riuscita')
      setKeyId(result.data.keyId); setSecret(result.data.secret)
    } finally { setBusy(false) }
  }
  const copy = async () => {
    if (!secret) return
    await navigator.clipboard.writeText(secret); setCopied(true); window.setTimeout(() => setCopied(false), 1800)
  }
  return <Card><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-semibold">Vendite verificate</h2></div><p className="mt-2 text-[11px] leading-5 text-gray-500">Chiave server-to-server per registrare checkout e ordini senza fidarsi del browser. Nessun dato personale è obbligatorio.</p>{keyId && <p className="mt-3 break-all rounded-lg bg-gray-50 p-2 font-mono text-[9px] text-gray-500">Key ID: {keyId}</p>}{secret && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2"><p className="break-all font-mono text-[9px] text-amber-900">{secret}</p><button onClick={copy} className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800"><Copy className="h-3 w-3" />{copied ? 'Copiato' : 'Copia segreto'}</button><p className="mt-1 text-[9px] text-amber-700">Salvalo ora: dopo aver chiuso la pagina non verrà più mostrato.</p></div>}<Button size="sm" variant="secondary" className="mt-3 w-full" loading={busy} onClick={rotate}>{keyId ? 'Ruota chiave' : 'Genera chiave'}</Button></Card>
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <Card className="flex items-center gap-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{icon}</div><div><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-xl font-bold text-gray-950">{value.toLocaleString('it-IT')}</p></div></Card>
}
