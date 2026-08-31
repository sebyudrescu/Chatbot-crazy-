"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, KeyRound, Loader2, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  return <Suspense fallback={<main className="min-h-screen bg-gray-950" />}><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const configurationMissing = search.get("configuration") === "missing";
  const verification = search.get("verification");
  const [mode, setMode] = useState<"owner" | "client">("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const finishLogin = (result: { mode?: string }) => {
    const next = search.get("next");
    router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : result.mode === "client" ? "/portal" : "/dashboard");
    router.refresh();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    const response = await fetch(mfaChallenge ? "/api/auth/mfa/verify" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mfaChallenge ? { challenge: mfaChallenge, code: mfaCode } : mode === "client" ? { email, password } : { password }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) { setError(result.error || "Accesso non riuscito"); setLoading(false); return; }
    if (result.mfaRequired) { setMfaChallenge(result.challenge); setPassword(""); setLoading(false); return; }
    finishLogin(result);
  };

  const changeMode = (nextMode: "owner" | "client") => {
    setMode(nextMode); setError(""); setMfaChallenge(""); setMfaCode("");
  };

  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950 p-5">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,60,255,0.25),_transparent_38%)]" />
    <form onSubmit={submit} className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Bot className="h-5 w-5" /></div><div><p className="text-lg font-bold text-gray-950">LitX AI</p><p className="text-[10px] uppercase tracking-widest text-gray-400">Area privata</p></div></div>
      {!mfaChallenge && <div className="mt-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1"><button type="button" onClick={() => changeMode("owner")} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === "owner" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"}`}>Agenzia</button><button type="button" onClick={() => changeMode("client")} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mode === "client" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"}`}>Cliente</button></div>}
      <div className="mt-6"><h1 className="text-xl font-bold text-gray-950">{mfaChallenge ? "Verifica in due passaggi" : mode === "owner" ? "Accesso proprietario" : "Accedi al tuo portale"}</h1><p className="mt-1 text-xs leading-5 text-gray-500">{mfaChallenge ? "Inserisci il codice dell’app Authenticator oppure uno dei codici di recupero." : mode === "owner" ? "Gestisci tutti gli agenti e i workspace dei clienti." : "Usa l’indirizzo email con cui hai accettato l’invito."}</p></div>
      {configurationMissing && mode === "owner" && !mfaChallenge && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800"><strong>Configurazione richiesta.</strong> Imposta <code className="rounded bg-amber-100 px-1">APP_ACCESS_PASSWORD</code> e <code className="rounded bg-amber-100 px-1">APP_AUTH_SALT</code> nelle variabili protette del server.</div>}
      {verification === "success" && mode === "client" && <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">Email verificata. Ora puoi accedere al workspace.</div>}
      {verification === "invalid" && mode === "client" && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Link non valido o scaduto. <Link href="/verify-email" className="font-bold underline">Richiedine uno nuovo</Link>.</div>}
      {mfaChallenge ? <label className="mt-5 block"><span className="label">Codice di verifica</span><div className="relative"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus value={mfaCode} onChange={event => setMfaCode(event.target.value)} className="input pl-9 tracking-widest" autoComplete="one-time-code" inputMode="text" /></div></label> : <>{mode === "client" && <label className="mt-5 block"><span className="label">Email</span><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus type="email" value={email} onChange={event => setEmail(event.target.value)} className="input pl-9" autoComplete="email" /></div></label>}<label className={`${mode === "client" ? "mt-4" : "mt-5"} block`}><span className="label">Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus={mode === "owner"} type="password" value={password} onChange={event => setPassword(event.target.value)} className="input pl-9" autoComplete="current-password" /></div></label></>}
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <Button type="submit" fullWidth className="mt-5" disabled={mfaChallenge ? mfaCode.length < 6 || loading : !password || (mode === "client" && !email) || loading || (configurationMissing && mode === "owner")} icon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mfaChallenge ? <KeyRound className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}>{mfaChallenge ? "Verifica e accedi" : "Entra"}</Button>
      {mfaChallenge && <button type="button" onClick={() => { setMfaChallenge(""); setMfaCode(""); setError(""); }} className="mt-3 w-full text-center text-xs font-semibold text-gray-500 hover:text-gray-800">Torna a email e password</button>}
      {!mfaChallenge && mode === "client" && <div className="mt-4 flex items-center justify-center gap-3 text-xs font-semibold"><Link href="/forgot-password" className="text-brand-600 hover:text-brand-700">Password dimenticata?</Link><span className="text-gray-300">·</span><Link href="/register" className="text-brand-600 hover:text-brand-700">Crea account</Link></div>}
      <p className="mt-5 text-center text-[10px] text-gray-400">Accesso riservato · cookie HttpOnly · dati isolati per azienda</p>
    </form>
  </main>;
}
