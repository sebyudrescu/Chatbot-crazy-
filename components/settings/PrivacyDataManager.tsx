"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  DatabaseZap,
  Download,
  Loader2,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type MatchBy = "email" | "phone" | "session";
type Agent = { id: string; companyName: string };
type PrivacyResult = {
  chatbot: Agent;
  counts: {
    conversations: number;
    messages: number;
    structuredFacts: number;
    crmContacts: number;
  };
};

export function PrivacyDataManager() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [botId, setBotId] = useState("");
  const [matchBy, setMatchBy] = useState<MatchBy>("email");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PrivacyResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"search" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/chatbots")
      .then((response) => response.json())
      .then((payload) => {
        const nextAgents = payload.success ? payload.data : [];
        setAgents(nextAgents);
        setBotId(nextAgents[0]?.id || "");
      })
      .catch(() => setError("Impossibile caricare gli agenti."));
  }, []);

  const params = useMemo(
    () =>
      new URLSearchParams({
        botId,
        matchBy,
        query: query.trim(),
      }),
    [botId, matchBy, query],
  );

  const search = async () => {
    setBusy("search");
    setError("");
    setSuccess("");
    setResult(null);
    setConfirmation("");
    try {
      const response = await fetch(`/api/privacy/visitor-data?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Ricerca non riuscita");
      setResult(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ricerca non riuscita");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/privacy/visitor-data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId,
          matchBy,
          query: query.trim(),
          confirmation,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Cancellazione non riuscita");
      setSuccess(
        `Eliminate ${payload.data.deletedConversations} conversazioni e ${payload.data.deletedContacts} schede CRM.`,
      );
      setResult(null);
      setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellazione non riuscita");
    } finally {
      setBusy(null);
    }
  };

  const totalRecords = result
    ? result.counts.conversations +
      result.counts.messages +
      result.counts.structuredFacts +
      result.counts.crmContacts
    : 0;

  return (
    <section className="card p-5" aria-labelledby="privacy-data-title">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <DatabaseZap className="h-5 w-5" />
        </div>
        <div>
          <h2 id="privacy-data-title" className="text-sm font-semibold text-gray-950">
            Dati e richieste privacy
          </h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Trova tutti i dati di un visitatore, esportali in JSON oppure cancellali
            definitivamente da conversazioni, memoria e CRM.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(180px,1fr)_150px_minmax(220px,1.4fr)_auto]">
        <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Agente
          <select
            value={botId}
            onChange={(event) => {
              setBotId(event.target.value);
              setResult(null);
            }}
            className="input text-xs normal-case tracking-normal"
          >
            {!agents.length && <option value="">Nessun agente</option>}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.companyName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Cerca per
          <select
            value={matchBy}
            onChange={(event) => {
              setMatchBy(event.target.value as MatchBy);
              setResult(null);
            }}
            className="input text-xs normal-case tracking-normal"
          >
            <option value="email">Email</option>
            <option value="phone">Telefono</option>
            <option value="session">ID sessione</option>
          </select>
        </label>
        <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Identificativo esatto
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setResult(null);
            }}
            className="input text-xs normal-case tracking-normal"
            type={matchBy === "email" ? "email" : "text"}
            placeholder={
              matchBy === "email"
                ? "cliente@esempio.it"
                : matchBy === "phone"
                  ? "+39 333 123 4567"
                  : "widget_session_..."
            }
          />
        </label>
        <div className="flex items-end">
          <Button
            onClick={search}
            disabled={!botId || query.trim().length < 3 || Boolean(busy)}
            icon={
              busy === "search" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )
            }
          >
            Cerca
          </Button>
        </div>
      </div>

      <div aria-live="polite">
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {success}
          </div>
        )}
      </div>

      {result && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-900">
                {totalRecords
                  ? `${totalRecords} record personali trovati`
                  : "Nessun dato personale trovato"}
              </p>
              <p className="mt-1 text-[10px] text-gray-500">
                {result.counts.conversations} conversazioni · {result.counts.messages} messaggi
                {" · "}
                {result.counts.structuredFacts} elementi memoria · {result.counts.crmContacts} contatti CRM
              </p>
            </div>
            {totalRecords > 0 && (
              <a
                href={`/api/privacy/visitor-data?${params}&download=1`}
                className="btn btn-secondary btn-sm"
              >
                <Download className="h-4 w-4" />
                Esporta JSON
              </a>
            )}
          </div>

          {totalRecords > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <p className="text-[10px] leading-5 text-gray-500">
                La cancellazione è irreversibile. Per confermare, digita{" "}
                <strong className="text-gray-800">ELIMINA</strong>.
              </p>
              <div className="mt-2 flex max-w-lg flex-col gap-2 sm:flex-row">
                <input
                  aria-label="Conferma cancellazione dati"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="input text-xs"
                  placeholder="ELIMINA"
                />
                <Button
                  variant="danger"
                  disabled={confirmation !== "ELIMINA" || Boolean(busy)}
                  onClick={remove}
                  icon={
                    busy === "delete" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )
                  }
                >
                  Cancella dati
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
