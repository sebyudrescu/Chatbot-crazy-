'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bot, CheckCircle2, Loader2, LockKeyhole, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'

type Invitation = { email: string; role: string; workspaceName: string; expiresAt: string }

export default function AcceptInvitePage() {
  return <Suspense fallback={<main className="min-h-screen bg-gray-950" />}><AcceptInviteForm /></Suspense>
}

function AcceptInviteForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') || ''
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setError('Link di invito non valido.'); setLoading(false); return }
    fetch(`/api/auth/invitations/${encodeURIComponent(token)}`)
      .then(async response => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => { if (!ok) throw new Error(body.error || 'Invito non disponibile'); setInvitation(body.data) })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Invito non disponibile'))
      .finally(() => setLoading(false))
  }, [token])

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError('')
    const response = await fetch(`/api/auth/invitations/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName, password }) })
    const result = await response.json()
    if (!response.ok || !result.success) { setError(result.error || 'Accettazione non riuscita'); setSubmitting(false); return }
    router.replace('/portal'); router.refresh()
  }

  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950 p-5"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,60,255,0.3),_transparent_42%)]" /><section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white p-7 shadow-2xl"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Bot className="h-5 w-5" /></div><div><p className="text-lg font-bold text-gray-950">LitX AI</p><p className="text-[10px] uppercase tracking-widest text-gray-400">Portale cliente</p></div></div>{loading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div> : error && !invitation ? <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : invitation ? <form onSubmit={submit}><div className="mt-7 rounded-xl border border-brand-100 bg-brand-50 p-4"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" /><div><h1 className="font-bold text-gray-950">Invito a {invitation.workspaceName}</h1><p className="mt-1 text-xs leading-5 text-gray-600">Account: {invitation.email} · Ruolo: {invitation.role}</p></div></div></div><label className="mt-5 block"><span className="label">Nome visualizzato</span><div className="relative"><UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus value={displayName} onChange={event => setDisplayName(event.target.value)} className="input pl-9" autoComplete="name" /></div></label><label className="mt-4 block"><span className="label">Password personale</span><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="password" value={password} onChange={event => setPassword(event.target.value)} className="input pl-9" autoComplete="new-password" minLength={10} /></div><span className="mt-1 block text-[10px] text-gray-400">Almeno 10 caratteri. Non verrà mai condivisa con l’agenzia.</span></label>{error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}<Button type="submit" fullWidth className="mt-5" disabled={displayName.trim().length < 2 || password.length < 10 || submitting} icon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}>Attiva il mio account</Button></form> : null}</section></main>
}
