"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Send,
  UserRoundCheck,
} from "lucide-react";

export interface LeadFormDefinition {
  id: string;
  title: string;
  description: string;
  fields: string[];
  submitLabel?: string;
}

interface SignedWidgetSession {
  sessionId: string;
  token: string;
  expiresAt: number;
}

class WidgetSessionError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const sessionCache = new Map<string, SignedWidgetSession>();

export async function getLeadWidgetSession(botId: string) {
  const cached = sessionCache.get(botId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;
  const response = await fetch(
    `/api/embed/${encodeURIComponent(botId)}/session`,
    {
      method: "POST",
      headers: { Accept: "application/json" },
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new WidgetSessionError(result.error || "widget_session_unavailable");
  }
  const session = result.data as SignedWidgetSession;
  sessionCache.set(botId, session);
  return session;
}

export function LeadCaptureForm({
  botId,
  conversationId,
  userSessionId,
  definition,
}: {
  botId: string;
  conversationId: string | null;
  userSessionId: string;
  definition: LeadFormDefinition;
}) {
  const formId = useId();
  const [session, setSession] = useState<SignedWidgetSession | null>(null);
  const [sessionState, setSessionState] = useState<
    "loading" | "ready" | "preview" | "error"
  >("loading");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSessionState("loading");
    void getLeadWidgetSession(botId)
      .then((nextSession) => {
        if (cancelled) return;
        if (nextSession.sessionId !== userSessionId) {
          setSessionState("error");
          setError(
            "La sessione del modulo non coincide con questa conversazione. Avvia una nuova sessione di chat.",
          );
          return;
        }
        setSession(nextSession);
        setSessionState("ready");
      })
      .catch((caught) => {
        if (cancelled) return;
        if (
          caught instanceof WidgetSessionError &&
          caught.code === "agent_not_published"
        ) {
          setSessionState("preview");
        } else {
          setSessionState("error");
          setError("Il modulo contatti non è disponibile in questo momento.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [botId, userSessionId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!conversationId || !session || sessionState !== "ready") return;
    if (name.trim().length < 2) {
      setError("Inserisci il tuo nome.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Inserisci almeno un indirizzo email o un numero di telefono.");
      return;
    }
    if (!consent) {
      setError("Devi acconsentire al ricontatto per inviare la richiesta.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/embed/${encodeURIComponent(botId)}/lead`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-LitX-Widget-Session": session.token,
          },
          body: JSON.stringify({
            conversationId,
            userSessionId,
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            company: company.trim(),
            consent: true,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success)
        throw new Error(result.error || "Invio non riuscito");
      setSubmitted(true);
      setEmail("");
      setPhone("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Invio non riuscito. Riprova.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section
        className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800"
        role="status"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-xs font-semibold">Richiesta inviata</p>
            <p className="mt-1 text-[10px] leading-4 opacity-80">
              Il team ha ricevuto i tuoi dati e potrà ricontattarti.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (sessionState === "preview") {
    return (
      <section
        className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
        aria-label={`Anteprima: ${definition.title}`}
      >
        <div className="flex items-start gap-3">
          <UserRoundCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-xs font-semibold">Anteprima modulo lead</p>
            <p className="mt-1 text-[10px] leading-4">
              Questo agente non è ancora pubblicato. Il modulo sarà compilabile
              dopo la pubblicazione; nessun dato viene salvato in questa
              anteprima.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 rounded-2xl border border-brand-100 bg-white p-4 shadow-sm"
      aria-labelledby={`${formId}-title`}
      aria-describedby={`${formId}-description`}
      noValidate
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <UserRoundCheck className="h-4 w-4" />
        </span>
        <div>
          <h3
            id={`${formId}-title`}
            className="text-xs font-semibold text-gray-900"
          >
            {definition.title}
          </h3>
          <p
            id={`${formId}-description`}
            className="mt-0.5 text-[10px] leading-4 text-gray-500"
          >
            {definition.description}
          </p>
        </div>
      </div>
      {sessionState === "loading" ? (
        <p
          className="mt-3 flex items-center gap-2 rounded-xl bg-gray-50 p-3 text-[10px] text-gray-500"
          role="status"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
          Preparazione sicura del modulo…
        </p>
      ) : (
        <fieldset
          disabled={sessionState !== "ready" || submitting}
          className="mt-3 grid gap-2"
        >
          <legend className="sr-only">Dati per essere ricontattato</legend>
          <label className="text-[10px] font-medium text-gray-600">
            <span className="mb-1 block">Nome *</span>
            <input
              className="input py-2 text-xs"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              maxLength={100}
              required
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] font-medium text-gray-600">
              <span className="mb-1 block">Email</span>
              <input
                className="input py-2 text-xs"
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={254}
                placeholder="nome@email.it"
              />
            </label>
            <label className="text-[10px] font-medium text-gray-600">
              <span className="mb-1 block">Telefono</span>
              <input
                className="input py-2 text-xs"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                maxLength={40}
                placeholder="+39…"
              />
            </label>
          </div>
          {definition.fields.includes("company") ? (
            <label className="text-[10px] font-medium text-gray-600">
              <span className="mb-1 block">
                Azienda{" "}
                <span className="font-normal text-gray-400">(opzionale)</span>
              </span>
              <input
                className="input py-2 text-xs"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                autoComplete="organization"
                maxLength={120}
              />
            </label>
          ) : null}
          <label className="mt-1 flex cursor-pointer items-start gap-2 text-[9px] leading-4 text-gray-600">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              Acconsento a essere ricontattato usando i dati inseriti. *
            </span>
          </label>
        </fieldset>
      )}
      {error ? (
        <p
          className="mt-3 rounded-lg bg-red-50 p-2.5 text-[10px] leading-4 text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={sessionState !== "ready" || submitting || !conversationId}
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {submitting
          ? "Invio in corso…"
          : definition.submitLabel || "Invia richiesta"}
      </button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[8px] text-gray-400">
        <LockKeyhole className="h-3 w-3" />
        Dati inviati tramite sessione firmata
      </p>
    </form>
  );
}
