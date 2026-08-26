'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bot, Loader2, LockKeyhole, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  return <Suspense fallback={<main className="min-h-screen bg-gray-950" />}><LoginForm /></Suspense>
}

function LoginForm() {
  const router = useRouter(), search = useSearchParams()
  const configurationMissing = search.get('configuration') === 'missing'
  const [mode, setMode] = useState<'owner' | 'client'>('owner'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'client' ? { email, password } : { password }) })
    const result = await response.json()
    if (!response.ok || !result.success) { setError(result.error || 'Accesso non riuscito'); setLoading(false); return }
    const next = search.get('next'); router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : result.mode === 'client' ? '/portal' : '/dashboard'); router.refresh()
  }
  return <main className="flex min-h-screen items-center justify-center bg-gray-950 p-5"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,60,255,0.25),_transparent_38%)]" /><form onSubmit={submit} className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white p-7 shadow-2xl"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Bot className="h-5 w-5" /></div><div><p className="text-lg font-bold text-gray-950">LitX AI</p><p className="text-[10px] uppercase tracking-widest text-gray-400">Area privata</p></div></div><div className="mt-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1"><button type="button" onClick={() => { setMode('owner'); setError('') }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === 'owner' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}>Agenzia</button><button type="button" onClick={() => { setMode('client'); setError('') }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === 'client' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}>Cliente</button></div><div className="mt-6"><h1 className="text-xl font-bold text-gray-950">{mode === 'owner' ? 'Accesso proprietario' : 'Accedi al tuo portale'}</h1><p className="mt-1 text-xs leading-5 text-gray-500">{mode === 'owner' ? 'Gestisci tutti gli agenti e i workspace dei clienti.' : 'Usa l’indirizzo email con cui hai accettato l’invito.'}</p></div>{configurationMissing && mode === 'owner' && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800"><strong>Configurazione richiesta.</strong> Imposta <code className="rounded bg-amber-100 px-1">APP_ACCESS_PASSWORD</code> e <code className="rounded bg-amber-100 px-1">APP_AUTH_SALT</code> nelle variabili protette del server.</div>}{mode === 'client' && <label className="mt-5 block"><span className="label">Email</span><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus type="email" value={email} onChange={event => setEmail(event.target.value)} className="input pl-9" autoComplete="email" /></div></label>}<label className={`${mode === 'client' ? 'mt-4' : 'mt-5'} block`}><span className="label">Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus={mode === 'owner'} type="password" value={password} onChange={event => setPassword(event.target.value)} className="input pl-9" autoComplete="current-password" /></div></label>{error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}<Button type="submit" fullWidth className="mt-5" disabled={!password || (mode === 'client' && !email) || loading || (configurationMissing && mode === 'owner')} icon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}>Entra</Button><p className="mt-5 text-center text-[10px] text-gray-400">Accesso riservato · cookie HttpOnly · dati isolati per azienda</p></form></main>
}
