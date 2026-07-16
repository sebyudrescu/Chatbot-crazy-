"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type Preview = {
  botId: string;
  companyName: string;
  retentionDays: number;
  cutoff: string;
  expiredConversations: number;
  expiredContacts: number;
};

const retentionOptions = [
  [90, "90 giorni"],
  [180, "180 giorni"],
  [365, "1 anno"],
  [730, "2 anni"],
  [1825, "5 anni"],
  [3650, "10 anni"],
] as const;

export function RetentionPolicyManager() {
  const [items, setItems] = useState<Preview[]>([]);
  const [automationConfigured, setAutomationConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [confirmingId, setConfirmingId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/privacy/retention");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setItems(payload.data);
      setAutomationConfigured(Boolean(payload.automationConfigured));
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Impossibile caricare le policy.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveDays = async (item: Preview, days: number) => {
    setBusyId(item.botId);
    setNotice(null);
    try {
      const response = await fetch(`/api/chatbots/${item.botId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { dataRetentionDays: days } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Salvataggio non riuscito");
      setNotice({
        type: "success",
        text: `Policy di ${item.companyName} aggiornata a ${days} giorni.`,
      });
      await load();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Salvataggio non riuscito",
      });
    } finally {
      setBusyId("");
    }
  };

  const cleanup = async (item: Preview) => {
    setBusyId(item.botId);
    setNotice(null);
    try {
      const response = await fetch("/api/privacy/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: item.botId,
          confirmation,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Pulizia non riuscita");
      setNotice({
        type: "success",
        text: `Pulizia completata: ${payload.data.totals.conversations} conversazioni e ${payload.data.totals.crmContacts} contatti rimossi.`,
      });
      setConfirmingId("");
      setConfirmation("");
      await load();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Pulizia non riuscita",
      });
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="card p-5" aria-labelledby="retention-policy-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h2 id="retention-policy-title" className="text-sm font-semibold text-gray-950">
              Conservazione automatica
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">
              Elimina conversazioni, contatti CRM e tracce collegate quando superano
              il periodo stabilito per ciascun cliente.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Aggiorna anteprima conservazione"
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
          ? "Pulizia automatica protetta e pianificata ogni giorno alle 02:30 UTC."
          : "La pianificazione è pronta. Prima del deployment configura CRON_SECRET su Vercel per autorizzarla."}
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
          {items.map((item) => {
            const expired = item.expiredConversations + item.expiredContacts;
            return (
              <div key={item.botId} className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-900">
                      {item.companyName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3 w-3" />
                        Scadenza prima del{" "}
                        {new Date(item.cutoff).toLocaleDateString("it-IT")}
                      </span>
                      <span
                        className={
                          expired ? "font-semibold text-amber-700" : "text-emerald-700"
                        }
                      >
                        {item.expiredConversations} chat · {item.expiredContacts} contatti
                        scaduti
                      </span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[10px] font-semibold text-gray-500">
                    Conserva per
                    <select
                      value={item.retentionDays}
                      onChange={(event) => saveDays(item, Number(event.target.value))}
                      disabled={busyId === item.botId}
                      className="input w-32 py-2 text-xs font-normal text-gray-700"
                    >
                      {retentionOptions.map(([days, label]) => (
                        <option key={days} value={days}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!expired || Boolean(busyId)}
                    onClick={() => {
                      setConfirmingId(item.botId);
                      setConfirmation("");
                    }}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                  >
                    Pulisci ora
                  </Button>
                </div>

                {confirmingId === item.botId && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-[10px] leading-5 text-red-700">
                      Verranno eliminati solo i dati precedenti alla soglia. Digita{" "}
                      <strong>PULISCI DATI SCADUTI</strong> per procedere.
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        autoFocus
                        aria-label={`Conferma pulizia dati di ${item.companyName}`}
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        className="input max-w-sm text-xs"
                        placeholder="PULISCI DATI SCADUTI"
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={
                          confirmation !== "PULISCI DATI SCADUTI" ||
                          busyId === item.botId
                        }
                        onClick={() => cleanup(item)}
                        icon={
                          busyId === item.botId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )
                        }
                      >
                        Conferma pulizia
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setConfirmingId("")}
                      >
                        Annulla
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!items.length && (
            <p className="p-6 text-center text-xs text-gray-400">
              Crea un agente per configurare la conservazione.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
