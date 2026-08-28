"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    const response = await fetch("/api/auth/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error || "Richiesta non riuscita");
    setMessage(result.message); setEmail("");
  };
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950 p-5"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,60,255,0.3),_transparent_42%)]"/><section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white p-7 shadow-2xl"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Bot className="h-5 w-5"/></div><div><p className="text-lg font-bold text-gray-950">LitX AI</p><p className="text-[10px] uppercase tracking-widest text-gray-400">Recupero account</p></div></div><h1 className="mt-7 text-xl font-bold text-gray-950">Password dimenticata?</h1><p className="mt-2 text-xs leading-5 text-gray-500">Inserisci l’email del tuo account cliente. Per sicurezza la risposta non confermerà se l’indirizzo esiste.</p>{message ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800" role="status">{message}</div> : <form onSubmit={submit}><label className="mt-5 block"><span className="label">Email</span><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/><input autoFocus type="email" value={email} onChange={event=>setEmail(event.target.value)} className="input pl-9" autoComplete="email" required/></div></label>{error&&<p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}<Button type="submit" fullWidth className="mt-5" disabled={!email||loading} icon={loading?<Loader2 className="h-4 w-4 animate-spin"/>:<Mail className="h-4 w-4"/>}>Invia link sicuro</Button></form>}<Link href="/login" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"><ArrowLeft className="h-3.5 w-3.5"/>Torna al login</Link></section></main>;
}
