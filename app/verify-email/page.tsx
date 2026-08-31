"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bot, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function VerifyEmailPage() { return <Suspense fallback={<main className="min-h-screen bg-gray-950" />}><VerifyEmailForm /></Suspense>; }

function VerifyEmailForm() {
  const search = useSearchParams();
  const [email, setEmail] = useState(search.get("email") || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(search.get("created") === "true" ? "Account creato. Controlla la posta e apri il link di verifica." : "");
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); const response = await fetch("/api/auth/email-verification/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const result = await response.json(); setMessage(result.message || result.error || "Richiesta completata"); setBusy(false); };
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950 p-5"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,60,255,0.3),_transparent_42%)]" /><section className="relative w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Bot className="h-5 w-5" /></div><div><p className="text-lg font-bold">LitX AI</p><p className="text-[10px] uppercase tracking-widest text-gray-400">Verifica email</p></div></div><h1 className="mt-7 text-xl font-bold">Attiva il tuo account</h1><p className="mt-2 text-sm leading-6 text-gray-500">Il link scade dopo 24 ore. Se non lo trovi, controlla lo spam oppure richiedine uno nuovo.</p><form onSubmit={submit} className="mt-5"><label className="block"><span className="label">Email</span><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="email" value={email} onChange={event => setEmail(event.target.value)} className="input pl-9" required /></div></label><Button type="submit" fullWidth className="mt-4" loading={busy}>Invia nuovo link</Button></form>{message && <p role="status" className="mt-4 rounded-lg bg-brand-50 p-3 text-xs leading-5 text-brand-700">{message}</p>}<Link href="/login" className="mt-5 block text-center text-xs font-semibold text-brand-600">Torna all’accesso</Link></section></main>;
}
