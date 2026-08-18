"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Agent { id: string; companyName: string }
interface ApiKeyItem { id: string; botId: string; name: string; keyPrefix: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string }

export function AgentApiKeyManager() {
  const [agents, setAgents] = useState<Agent[]>([]), [botId, setBotId] = useState("")
  const [items, setItems] = useState<ApiKeyItem[]>([]), [loading, setLoading] = useState(false)
  const [name, setName] = useState("Integrazione cliente"), [expires, setExpires] = useState("90")
  const [secret, setSecret] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState("https://tuo-dominio.example")
  const activeItems = useMemo(() => items.filter(item => !item.revokedAt), [items])

  useEffect(() => { setOrigin(window.location.origin); fetch("/api/chatbots").then(response => response.json()).then(result => { const list = result.success ? result.data : []; setAgents(list); if (list[0]) setBotId(list[0].id) }) }, [])
  useEffect(() => { if (!botId) return; setLoading(true); fetch(`/api/api-keys?botId=${encodeURIComponent(botId)}`).then(response => response.json()).then(result => { if (result.success) setItems(result.data); else setError(result.error) }).finally(() => setLoading(false)) }, [botId])

  const create = async () => {
    if (!botId || !name.trim()) return
    setBusy(true); setError(""); setSecret("")
    try {
      const response = await fetch("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ botId, name, expiresInDays: expires ? Number(expires) : null }) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Creazione non riuscita")
      setSecret(result.data.secret); setItems(current => [result.data, ...current]); setCopied(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Creazione non riuscita") } finally { setBusy(false) }
  }
  const revoke = async (id: string) => {
    if (!window.confirm("Revocare definitivamente questa chiave? Le integrazioni che la usano smetteranno subito di funzionare.")) return
    const response = await fetch(`/api/api-keys/${id}`, { method: "DELETE" }); const result = await response.json()
    if (!response.ok) return setError(result.error || "Revoca non riuscita")
    setItems(current => current.map(item => item.id === id ? { ...item, revokedAt: result.data.revokedAt } : item))
  }
  const copySecret = async () => { await navigator.clipboard.writeText(secret); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }

  return <section className="card p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-600" /><h2 className="text-sm font-semibold">API pubblica per gli agenti</h2></div><p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">Crea credenziali separate per collegare CRM, siti o automazioni. Le chiavi sono hashate, hanno scadenza, rate limit e possono essere revocate.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700">Scope minimo · chat:write</span></div>
    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_150px_auto]">
      <label><span className="label">Agente</span><select className="input" value={botId} onChange={event => { setBotId(event.target.value); setSecret(""); setError("") }}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.companyName}</option>)}</select></label>
      <label><span className="label">Nome chiave</span><input className="input" value={name} onChange={event => setName(event.target.value)} maxLength={100} /></label>
      <label><span className="label">Scadenza</span><select className="input" value={expires} onChange={event => setExpires(event.target.value)}><option value="30">30 giorni</option><option value="90">90 giorni</option><option value="365">1 anno</option><option value="">Nessuna</option></select></label>
      <Button className="self-end" onClick={create} loading={busy} disabled={!botId || !name.trim()} icon={<Plus className="h-4 w-4" />}>Crea chiave</Button>
    </div>
    {secret && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-900">Copiala adesso: non verrà mostrata di nuovo.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-gray-950 p-3 text-[10px] text-emerald-300">{secret}</code><Button variant="secondary" onClick={copySecret} icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}>{copied ? "Copiata" : "Copia"}</Button></div><pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-[9px] leading-5 text-gray-600">{`curl -X POST ${origin}/api/v1/chat \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"source":"api","botId":"${botId}","userSessionId":"customer-123","message":"Ciao"}'`}</pre></div>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b bg-gray-50 text-[9px] uppercase tracking-wider text-gray-400"><tr><th className="px-4 py-3">Nome</th><th>Prefisso</th><th>Ultimo utilizzo</th><th>Scadenza</th><th>Stato</th><th /></tr></thead><tbody className="divide-y">{items.map(item => <tr key={item.id}><td className="px-4 py-3 font-semibold text-gray-800">{item.name}</td><td><code className="text-[10px] text-gray-500">{item.keyPrefix}…</code></td><td className="text-[10px] text-gray-500">{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString("it-IT") : "Mai"}</td><td className="text-[10px] text-gray-500">{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString("it-IT") : "Nessuna"}</td><td><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${item.revokedAt ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700"}`}>{item.revokedAt ? "Revocata" : "Attiva"}</span></td><td className="text-right">{!item.revokedAt && <button onClick={() => revoke(item.id)} aria-label={`Revoca ${item.name}`} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><ShieldX className="h-4 w-4" /></button>}</td></tr>)}</tbody></table>{loading && <p className="p-6 text-center text-xs text-gray-400"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Caricamento chiavi…</p>}{!loading && !activeItems.length && <p className="p-6 text-center text-xs text-gray-400">Nessuna chiave attiva per questo agente.</p>}</div>
  </section>
}
