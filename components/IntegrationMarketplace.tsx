'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Check, CheckCircle2, CircleX, Copy, ExternalLink, Link2, Loader2, Plug, Search, Settings2, ShieldCheck, Unplug, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { launchWhatsAppEmbeddedSignup } from '@/lib/meta-browser'

interface Agent { id: string; companyName: string }
interface Connection { id: string; enabled: boolean; status: string; config: Record<string, string>; lastTestedAt?: string; lastError?: string }
interface Integration { provider: string; name: string; category: string; description: string; color: string; initials: string; mode: 'native' | 'configuration' | 'planned'; fields?: Array<{ key: string; label: string; placeholder: string; type?: string }>; connection: Connection | null }
interface MetaSetupCheck { key: string; label: string; ready: boolean }
interface MetaChannelState { configured: boolean; connected: boolean; status: string; lastError?: string | null; label?: string | null; setup: { ready: boolean; checks: MetaSetupCheck[]; missing: string[] } }
interface MetaStatus { appId: string; graphVersion: string; whatsappConfigId: string; webhookUrl: string; whatsapp: MetaChannelState; instagram: MetaChannelState }

const categoryNames: Record<string, string> = { all: 'Tutte', channels: 'Canali', crm: 'CRM', calendar: 'Calendario', automation: 'Automazioni', commerce: 'E-commerce', support: 'Supporto', data: 'Dati' }
const isMeta = (provider: string): provider is 'whatsapp' | 'instagram' => provider === 'whatsapp' || provider === 'instagram'

export function IntegrationMarketplace({ initialCategory = 'all' }: { initialCategory?: string }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [botId, setBotId] = useState('')
  const [items, setItems] = useState<Integration[]>([])
  const [category, setCategory] = useState(initialCategory)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Integration | null>(null)
  const [config, setConfig] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null)

  useEffect(() => { fetch('/api/chatbots').then(response => response.json()).then(result => { const list = result.success ? result.data : []; setAgents(list); if (list[0]) setBotId(list[0].id) }) }, [])
  const load = useCallback(async () => {
    if (!botId) return
    const [result, meta] = await Promise.all([fetch(`/api/integrations?botId=${botId}`).then(response => response.json()), fetch(`/api/meta/status?botId=${botId}`).then(response => response.json())])
    setItems(result.data || []); setMetaStatus(meta.success ? meta.data : null)
  }, [botId])
  useEffect(() => { load() }, [load])
  useEffect(() => { const status = new URLSearchParams(window.location.search).get('meta'); if (status === 'instagram-connected') setMessage('Instagram collegato correttamente. I nuovi Direct possono essere gestiti dal chatbot.') }, [])

  const filtered = useMemo(() => items.filter(item => (category === 'all' || item.category === category) && `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase())), [items, category, search])
  const connected = items.filter(item => item.connection?.enabled).length
  const open = (item: Integration) => { setEditing(item); setConfig(item.connection?.config || {}); setMessage('') }
  const save = async () => {
    if (!editing || !botId) return
    setBusy(true)
    const response = await fetch('/api/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId, provider: editing.provider, config, enabled: true }) })
    const result = await response.json()
    if (!response.ok) setMessage(result.error || 'Configurazione non riuscita'); else { setEditing(null); await load() }
    setBusy(false)
  }
  const remove = async (item: Integration) => { if (!item.connection) return; await fetch(`/api/integrations/${item.connection.id}`, { method: 'DELETE' }); await load() }
  const test = async (item: Integration) => { if (!item.connection) return; setBusy(true); const result = await fetch(`/api/integrations/${item.connection.id}/test`, { method: 'POST' }).then(response => response.json()); setMessage(result.success ? 'Connessione verificata correttamente.' : result.error); await load(); setBusy(false) }
  const connectMeta = async (provider: 'whatsapp' | 'instagram') => {
    if (!botId || !metaStatus) return
    if (!metaStatus[provider].configured) { setMessage('Configurazione Meta incompleta: aggiungi App ID, segreti, Config ID, versione Graph e URL HTTPS nelle variabili server.'); return }
    setBusy(true); setMessage('')
    try {
      if (provider === 'instagram') {
        const response = await fetch(`/api/meta/instagram/connect?botId=${botId}`), result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Avvio Instagram non riuscito')
        window.location.assign(result.data.url); return
      }
      const signup = await launchWhatsAppEmbeddedSignup(metaStatus)
      const response = await fetch('/api/meta/whatsapp/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId, ...signup }) }), result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Collegamento WhatsApp non riuscito')
      setMessage('WhatsApp collegato correttamente. Il chatbot può ricevere e rispondere ai nuovi messaggi.'); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Collegamento Meta non riuscito') }
    finally { setBusy(false) }
  }

  return <div className="mx-auto max-w-[1500px] p-4 lg:p-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">{initialCategory === 'channels' ? 'Pubblicazione omnicanale' : 'Connection center'}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{initialCategory === 'channels' ? 'Canali' : 'Integrazioni'}</h1><p className="mt-1 text-sm text-gray-500">Collega strumenti reali all’agente. Le funzioni non ancora disponibili sono indicate chiaramente.</p></div><div className="card flex items-center gap-3 px-4 py-3"><Plug className="h-4 w-4 text-brand-600" /><div><p className="text-[9px] uppercase tracking-wider text-gray-400">Attive</p><p className="text-sm font-bold">{connected}</p></div></div></div>
    <div className="mt-6 card flex flex-wrap items-center gap-3 p-4"><div className="min-w-[220px] flex-1"><label className="label">Agente</label><select className="input" value={botId} onChange={event => setBotId(event.target.value)}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.companyName}</option>)}</select></div><div className="relative min-w-[220px] flex-1"><label className="label">Cerca</label><Search className="absolute bottom-3 left-3 h-4 w-4 text-gray-400" /><input className="input pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="WhatsApp, CRM, calendario..." /></div></div>
    <div className="mt-4 flex flex-wrap gap-2">{Object.entries(categoryNames).map(([key, label]) => <button key={key} onClick={() => setCategory(key)} className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${category === key ? 'bg-brand-600 text-white' : 'border bg-white text-gray-500'}`}>{label}</button>)}</div>
    {!agents.length ? <div className="card mt-5 flex min-h-80 flex-col items-center justify-center text-center"><Bot className="h-8 w-8 text-brand-600" /><p className="mt-3 text-sm font-semibold">Crea prima un agente</p></div> : <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(item => <article key={item.provider} className="card p-5"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: item.color }}>{item.initials}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-gray-900">{item.name}</h2>{item.connection?.enabled && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">Attiva</span>}</div><p className="mt-1 min-h-10 text-[11px] leading-5 text-gray-500">{item.description}</p></div></div><div className="mt-4 flex items-center justify-between border-t pt-4"><span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{categoryNames[item.category]}</span>{item.mode === 'planned' ? <span className="rounded-lg bg-gray-100 px-3 py-2 text-[10px] font-semibold text-gray-500">Connettore in sviluppo</span> : item.connection ? <div className="flex gap-1"><button onClick={() => open(item)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Configura"><Settings2 className="h-4 w-4" /></button><button onClick={() => remove(item)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Disconnetti"><Unplug className="h-4 w-4" /></button></div> : <Button size="sm" variant="secondary" onClick={() => open(item)} icon={<Plug className="h-3.5 w-3.5" />}>Collega</Button>}</div>{item.connection?.lastError && <p className="mt-3 rounded-lg bg-red-50 p-2 text-[10px] text-red-700">{item.connection.lastError}</p>}</article>)}</div>}
    {editing && <IntegrationDialog editing={editing} botId={botId} config={config} setConfig={setConfig} busy={busy} message={message} metaStatus={metaStatus} onClose={() => setEditing(null)} onSave={save} onTest={() => test(editing)} onConnectMeta={connectMeta} />}
  </div>
}

function IntegrationDialog({ editing, botId, config, setConfig, busy, message, metaStatus, onClose, onSave, onTest, onConnectMeta }: { editing: Integration; botId: string; config: Record<string, string>; setConfig: (value: Record<string, string>) => void; busy: boolean; message: string; metaStatus: MetaStatus | null; onClose: () => void; onSave: () => void; onTest: () => void; onConnectMeta: (provider: 'whatsapp' | 'instagram') => void }) {
  const meta = isMeta(editing.provider) ? metaStatus?.[editing.provider] : undefined
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="integration-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-hard"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: editing.color }}>{editing.initials}</div><div><p className="eyebrow">Configurazione</p><h2 id="integration-title" className="text-lg font-bold">{editing.name}</h2></div></div><div className="mt-5 space-y-4">
    {editing.fields?.map(field => <label key={field.key} className="block"><span className="label">{field.label}</span><input className="input" type={field.type === 'secret' ? 'password' : field.type || 'text'} autoComplete={field.type === 'secret' ? 'new-password' : undefined} value={config[field.key] || ''} onChange={event => setConfig({ ...config, [field.key]: event.target.value })} placeholder={field.placeholder} /></label>)}
    {isMeta(editing.provider) ? <MetaConnectionPanel botId={botId} provider={editing.provider} state={meta} webhookUrl={metaStatus?.webhookUrl} /> : editing.mode === 'native' && <div className="rounded-xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-700"><Check className="mb-2 h-4 w-4" />Questa funzione è già inclusa nella piattaforma. Attivandola apparirà tra i canali collegati.</div>}
    {message && <p role="alert" className={`rounded-lg p-3 text-xs ${message.includes('correttamente') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message}</p>}
    {editing.provider === 'webhook' && editing.connection && <DeliveryHistory connectionId={editing.connection.id} />}
  </div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Annulla</Button>{editing.connection && editing.mode === 'configuration' && <Button variant="secondary" onClick={onTest} disabled={busy} icon={<Wifi className="h-4 w-4" />}>Testa</Button>}{isMeta(editing.provider) ? <Button onClick={() => onConnectMeta(editing.provider as 'whatsapp' | 'instagram')} disabled={busy || meta?.connected || !meta?.configured} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}>{meta?.connected ? 'Collegato' : 'Continua con Meta'}</Button> : <Button onClick={onSave} disabled={busy} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}>Salva</Button>}</div>{editing.provider === 'public-page' && botId && <a className="mt-4 flex items-center justify-center gap-1 text-xs font-semibold text-brand-700" href={`/chat/${botId}`} target="_blank">Apri pagina pubblica <ExternalLink className="h-3 w-3" /></a>}</div></div>
}

function MetaConnectionPanel({ botId, provider, state, webhookUrl }: { botId: string; provider: 'whatsapp' | 'instagram'; state?: MetaChannelState; webhookUrl?: string }) {
  const [copied, setCopied] = useState(false)
  const [clientLink, setClientLink] = useState('')
  const [clientLinkExpiresAt, setClientLinkExpiresAt] = useState('')
  const [clientLinkBusy, setClientLinkBusy] = useState(false)
  const [clientLinkError, setClientLinkError] = useState('')
  const [clientCopied, setClientCopied] = useState(false)
  const copyWebhook = async () => {
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  const docsUrl = provider === 'whatsapp'
    ? 'https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview'
    : 'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login'
  const createClientLink = async () => {
    setClientLinkBusy(true); setClientLinkError('')
    try {
      const response = await fetch('/api/meta/client-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId, provider }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Link cliente non disponibile')
      setClientLink(result.data.url); setClientLinkExpiresAt(result.data.expiresAt)
      await navigator.clipboard.writeText(result.data.url); setClientCopied(true); window.setTimeout(() => setClientCopied(false), 1800)
    } catch (error) { setClientLinkError(error instanceof Error ? error.message : 'Link cliente non disponibile') }
    finally { setClientLinkBusy(false) }
  }

  return <div className={`rounded-xl border p-4 ${state?.configured ? 'border-brand-100 bg-brand-50/40' : 'border-amber-200 bg-amber-50'}`}>
    <div className="flex items-start gap-3">
      <ShieldCheck className={`mt-0.5 h-5 w-5 shrink-0 ${state?.configured ? 'text-brand-600' : 'text-amber-600'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-900">Accesso ufficiale Meta</p>
        <p className="mt-1 text-[11px] leading-5 text-gray-600">{state?.connected
          ? `${state.label ? `${state.label} · ` : ''}Connessione attiva e token conservato cifrato.`
          : state?.configured
            ? `Configurazione proprietario completata. Si aprirà il login ${provider === 'whatsapp' ? 'Facebook/WhatsApp' : 'Instagram'} e il cliente selezionerà il proprio account senza condividere password o token.`
            : 'Configurazione proprietario da completare una sola volta. I clienti non dovranno fornirti App ID, segreti o token.'}</p>

        {state?.configured && !state.connected && <div className="mt-4 rounded-xl border border-brand-100 bg-white/90 p-3">
          <div className="flex items-start gap-2"><Link2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div><p className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">Collegamento assistito cliente</p><p className="mt-1 text-[10px] leading-4 text-gray-600">Genera un link sicuro valido 30 minuti. Il cliente accede direttamente con Meta senza vedere la dashboard e senza comunicarti credenziali.</p></div></div>
          {clientLink && <div className="mt-3 rounded-lg bg-gray-50 p-2"><p className="break-all font-mono text-[9px] leading-4 text-gray-500">{clientLink}</p><p className="mt-1 text-[9px] text-gray-400">Scade alle {new Date(clientLinkExpiresAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p></div>}
          {clientLinkError && <p role="alert" className="mt-2 text-[10px] text-red-700">{clientLinkError}</p>}
          <Button type="button" size="sm" variant="secondary" className="mt-3" disabled={clientLinkBusy} onClick={createClientLink} icon={clientLinkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : clientCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}>{clientCopied ? 'Link copiato' : clientLink ? 'Genera e copia un nuovo link' : 'Genera e copia link cliente'}</Button>
        </div>}

        {!state?.configured && state?.setup && <div className="mt-4 rounded-xl border border-amber-200 bg-white/80 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">Setup della tua piattaforma</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {state.setup.checks.map(check => <div key={check.key} className="flex items-center gap-2 text-[10px] text-gray-600">
              {check.ready ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <CircleX className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
              <span>{check.label}</span>
            </div>)}
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-4 text-[10px] leading-4 text-gray-600">
            <li>Crea la Meta App aziendale e abilita {provider === 'whatsapp' ? 'WhatsApp Embedded Signup' : 'Instagram Login'}.</li>
            <li>Salva i valori indicati come mancanti nelle variabili protette di Vercel.</li>
            <li>Configura e verifica il webhook, poi ripubblica l’app.</li>
          </ol>
          <a href={docsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700">Apri la guida ufficiale Meta <ExternalLink className="h-3 w-3" /></a>
        </div>}

        {webhookUrl && <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/80 p-2">
          <p className="min-w-0 flex-1 break-all font-mono text-[9px] text-gray-500">Webhook: {webhookUrl}</p>
          <button type="button" onClick={copyWebhook} aria-label="Copia indirizzo webhook" className="shrink-0 rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-brand-700"><Copy className="h-3.5 w-3.5" /></button>
          <span className="sr-only" aria-live="polite">{copied ? 'Webhook copiato' : ''}</span>
        </div>}
      </div>
    </div>
  </div>
}

function DeliveryHistory({ connectionId }: { connectionId: string }) {
  const [deliveries, setDeliveries] = useState<Array<{ id: string; event: string; success: boolean; status?: number; attempts?: number; durationMs?: number; error?: string; createdAt: string }>>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch(`/api/integrations/${connectionId}/deliveries`).then(response => response.json()).then(result => setDeliveries(result.data || [])).finally(() => setLoading(false)) }, [connectionId])
  return <div className="rounded-xl border border-gray-200 p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Ultime consegne</p>{loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}</div><div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{deliveries.map(item => <div key={item.id} className="flex items-start gap-2 rounded-lg bg-gray-50 p-2">{item.success ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}<div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-gray-700">{item.event}</p><p className="text-[9px] text-gray-400">{new Date(item.createdAt).toLocaleString('it-IT')} · HTTP {item.status || '—'} · {item.attempts || 0} tentativi · {item.durationMs || 0} ms</p>{item.error && <p className="mt-0.5 truncate text-[9px] text-red-600">{item.error}</p>}</div></div>)}{!loading && !deliveries.length && <p className="py-3 text-center text-[10px] text-gray-400">Nessuna consegna registrata.</p>}</div></div>
}
