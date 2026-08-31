"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Building2, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function RegistrationForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, companyName, email, password, acceptTerms }) });
    const result = await response.json();
    if (!response.ok || !result.success) { setError(result.error || "Registrazione non riuscita"); setBusy(false); return; }
    router.replace(`/verify-email?created=true&email=${encodeURIComponent(email)}`); router.refresh();
  };

  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950 p-5">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,60,255,0.3),_transparent_42%)]" />
    <section className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-white p-7 shadow-2xl">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Bot className="h-5 w-5" /></div><div><p className="text-lg font-bold text-gray-950">LitX AI</p><p className="text-[10px] uppercase tracking-widest text-gray-400">Crea il tuo workspace</p></div></div>
      <h1 className="mt-7 text-2xl font-bold text-gray-950">Porta il tuo assistente online</h1><p className="mt-2 text-sm leading-6 text-gray-500">Account aziendale isolato, accessi del team e configurazione guidata.</p>
      {!enabled ? <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800"><strong>Accesso anticipato.</strong> La registrazione autonoma non è ancora aperta. L’agenzia può già creare e invitare il tuo team in sicurezza.</div> : <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field icon={<UserRound />} label="Il tuo nome"><input value={displayName} onChange={event => setDisplayName(event.target.value)} className="input pl-9" autoComplete="name" required minLength={2} /></Field>
        <Field icon={<Building2 />} label="Azienda"><input value={companyName} onChange={event => setCompanyName(event.target.value)} className="input pl-9" autoComplete="organization" required minLength={2} /></Field>
        <div className="sm:col-span-2"><Field icon={<Mail />} label="Email di lavoro"><input type="email" value={email} onChange={event => setEmail(event.target.value)} className="input pl-9" autoComplete="email" required /></Field></div>
        <div className="sm:col-span-2"><Field icon={<LockKeyhole />} label="Password"><input type="password" value={password} onChange={event => setPassword(event.target.value)} className="input pl-9" autoComplete="new-password" minLength={12} required /></Field><p className="mt-1 text-[10px] text-gray-400">Almeno 12 caratteri. Puoi attivare MFA dopo l’accesso.</p></div>
        <label className="flex items-start gap-2 text-xs leading-5 text-gray-600 sm:col-span-2"><input type="checkbox" checked={acceptTerms} onChange={event => setAcceptTerms(event.target.checked)} className="mt-1" required /><span>Confermo di essere autorizzato a creare il workspace aziendale e accetto le condizioni del servizio.</span></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700 sm:col-span-2">{error}</p>}
        <Button type="submit" fullWidth className="sm:col-span-2" disabled={!acceptTerms || password.length < 12 || busy} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}>Crea workspace</Button>
      </form>}
      <p className="mt-6 text-center text-xs text-gray-500">Hai già un account? <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">Accedi</Link></p>
    </section>
  </main>;
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span><div className="relative">{<span className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}{children}</div></label>;
}
