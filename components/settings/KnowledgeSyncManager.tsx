"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CloudCog,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type SyncPreview = {
  botId: string;
  companyName: string;
  syncDays: number;
  cutoff: string;
  urlSources: number;
  staleSources: number;
  oldestSyncAt: string | null;
};

const frequencyOptions = [
  [1, "Ogni giorno"],
  [3, "Ogni 3 giorni"],
  [7, "Ogni settimana"],
  [14, "Ogni 2 settimane"],
  [30, "Ogni mese"],
  [90, "Ogni 3 mesi"],
] as const;

export function KnowledgeSyncManager() {
  const [items, setItems] = useState<SyncPreview[]>([]);
  const [automationConfigured, setAutomationConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge-sources/sync");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setItems(payload.data);
      setAutomationConfigured(Boolean(payload.automationConfigured));
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Impossibile controllare le fonti.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveFrequency = async (item: SyncPreview, days: number) => {
    setBusyId(item.botId);
    setNotice(null);
    try {
      const response = await fetch(`/api/chatbots/${item.botId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { knowledgeSyncDays: days } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setNotice({
        type: "success",
        text: `Frequenza di ${item.companyName} aggiornata.`,
      });
      await load();
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Aggiornamento non riuscito.",
      });
    } finally {
      setBusyId("");
    }
  };

  const schedule = async (item: SyncPreview) => {
    setBusyId(item.botId);
    setNotice(null);
    try {
      const response = await fetch("/api/knowledge-sources/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: item.botId, limit: 3 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setNotice({
        type: "success",
        text: payload.data.scheduled
          ? `${payload.data.scheduled} fonti accodate senza duplicare lavori esistenti.`
          : "Nessuna fonte scaduta da accodare.",
      });
      await load();
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Sincronizzazione non accodata.",
      });
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="card p-5" aria-labelledby="knowledge-sync-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
            <CloudCog className="h-5 w-5" />
          </div>
          <div>
            <h2 id="knowledge-sync-title" className="text-sm font-semibold text-gray-950">
              Aggiornamento knowledge base
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">
              Rileva le pagine web obsolete, crea un solo job per versione e sostituisce
              la fonte precedente soltanto dopo una nuova indicizzazione riuscita.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Aggiorna stato knowledge base"
          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div
        className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-[11px] leading-5 ${
          automationConfigured
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
      >
        {automationConfigured ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        {automationConfigured
          ? "Controllo automatico protetto pianificato ogni giorno alle 03:15 UTC."
          : "Configura CRON_SECRET nel deployment per attivare il controllo automatico. La sincronizzazione manuale resta disponibile."}
      </div>

      <div aria-live="polite">
        {notice && (
          <div
            className={`mt-4 rounded-xl border p-3 text-xs ${
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {notice.text}
          </div>
        )}
      </div>

      {loading && !items.length ? (
        <div className="flex h-28 items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="mt-5 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {items.map((item) => (
            <div
              key={item.botId}
              className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-gray-900">
                  {item.companyName}
                </p>
                <p className="mt-1 text-[10px] text-gray-500">
                  {item.urlSources} fonti web ·{" "}
                  <span
                    className={
                      item.staleSources
                        ? "font-semibold text-amber-700"
                        : "text-emerald-700"
                    }
                  >
                    {item.staleSources} da aggiornare
                  </span>
                  {item.oldestSyncAt &&
                    ` · più vecchia ${new Date(item.oldestSyncAt).toLocaleDateString("it-IT")}`}
                </p>
              </div>
              <label className="flex items-center gap-2 text-[10px] font-semibold text-gray-500">
                Frequenza
                <select
                  value={item.syncDays}
                  onChange={(event) =>
                    saveFrequency(item, Number(event.target.value))
                  }
                  disabled={busyId === item.botId}
                  className="input w-40 py-2 text-xs font-normal text-gray-700"
                >
                  {frequencyOptions.map(([days, label]) => (
                    <option key={days} value={days}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                variant="secondary"
                disabled={!item.staleSources || Boolean(busyId)}
                onClick={() => schedule(item)}
                icon={
                  busyId === item.botId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )
                }
              >
                Accoda sync
              </Button>
              <Link
                href={`/chatbot/${item.botId}/jobs`}
                className="inline-flex items-center justify-center gap-1 text-[10px] font-semibold text-brand-700"
              >
                Job <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ))}
          {!items.length && (
            <p className="p-6 text-center text-xs text-gray-400">
              Nessun agente disponibile.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
