"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Loader2,
  RefreshCw,
  RotateCcw,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type Health = {
  level: "healthy" | "warning" | "critical";
  checkedAt: string;
  ingestion: {
    pending: number;
    running: number;
    stale: number;
    failedLast7Days: number;
    latestCompletedAt: string | null;
  };
  knowledge: {
    failedSources: number;
    failedAgents: number;
    indexingAgents: number;
  };
  integrations: { webhookFailuresLast24Hours: number };
  events: { errorsLast24Hours: number };
  incidents: Array<{
    id: string;
    agent: string;
    type: string;
    error: string;
    attempts: number;
    maxAttempts: number;
    occurredAt: string | null;
  }>;
};

const levelCopy = {
  healthy: {
    title: "Sistema operativo",
    detail: "Non risultano problemi recenti che richiedono intervento.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
  },
  warning: {
    title: "Controllo consigliato",
    detail: "Sono presenti errori recenti o attività da verificare.",
    className: "border-amber-200 bg-amber-50 text-amber-900",
    icon: AlertTriangle,
  },
  critical: {
    title: "Intervento necessario",
    detail: "Uno o più agenti o processi di indicizzazione sono bloccati.",
    className: "border-red-200 bg-red-50 text-red-900",
    icon: AlertTriangle,
  },
};

export function OperationalMonitor({
  initialHealth,
}: {
  initialHealth: Health;
}) {
  const [health, setHealth] = useState(initialHealth);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/system/status", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.data?.operations) {
        throw new Error(result.error || "Stato operativo non disponibile");
      }
      setHealth(result.data.operations);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Impossibile aggiornare lo stato",
      );
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function retry(jobId: string) {
    setRetrying(jobId);
    setError("");
    try {
      const response = await fetch("/api/ingestion/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nuovo tentativo fallito");
      await refresh(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Impossibile riprovare il job",
      );
    } finally {
      setRetrying(null);
    }
  }

  const copy = levelCopy[health.level];
  const StatusIcon = copy.icon;
  return (
    <section className="card overflow-hidden" aria-labelledby="operations-title">
      <div className="flex flex-col gap-4 border-b border-gray-100 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand-600" />
            <h2 id="operations-title" className="text-sm font-semibold text-gray-950">
              Monitor operativo
            </h2>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Crawler, knowledge base e consegne esterne, aggiornati ogni 30 secondi.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void refresh()}
          icon={
            loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )
          }
        >
          Aggiorna
        </Button>
      </div>

      <div className="p-5">
        <div className={`rounded-xl border p-4 ${copy.className}`}>
          <div className="flex items-start gap-3">
            <StatusIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">{copy.title}</p>
              <p className="mt-1 text-xs opacity-80">{copy.detail}</p>
            </div>
          </div>
        </div>

        {error ? (
          <div
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OperationalMetric
            icon={DatabaseZap}
            label="Coda crawler"
            value={health.ingestion.pending + health.ingestion.running}
            detail={`${health.ingestion.pending} in attesa · ${health.ingestion.running} attivi`}
            danger={health.ingestion.stale > 0}
          />
          <OperationalMetric
            icon={AlertTriangle}
            label="Importazioni fallite"
            value={health.ingestion.failedLast7Days}
            detail="Negli ultimi 7 giorni"
            danger={health.ingestion.failedLast7Days > 0}
          />
          <OperationalMetric
            icon={Webhook}
            label="Webhook falliti"
            value={health.integrations.webhookFailuresLast24Hours}
            detail="Nelle ultime 24 ore"
            danger={health.integrations.webhookFailuresLast24Hours > 0}
          />
          <OperationalMetric
            icon={Clock3}
            label="Job bloccati"
            value={health.ingestion.stale}
            detail="Attivi da più di 20 minuti"
            danger={health.ingestion.stale > 0}
          />
        </div>

        <div className="mt-5 flex flex-col gap-2 text-[11px] text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Fonti fallite: {health.knowledge.failedSources} · Agenti in errore:{" "}
            {health.knowledge.failedAgents} · Errori 24h:{" "}
            {health.events.errorsLast24Hours}
          </span>
          <span>
            Ultimo controllo{" "}
            {new Date(health.checkedAt).toLocaleTimeString("it-IT", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {health.incidents.length ? (
          <div className="mt-5">
            <h3 className="text-xs font-semibold text-gray-900">
              Importazioni da risolvere
            </h3>
            <div className="mt-3 divide-y rounded-xl border border-gray-200">
              {health.incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs font-semibold text-gray-900">
                        {incident.agent}
                      </p>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gray-500">
                        {incident.type}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-gray-500">
                      {incident.error}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={retrying === incident.id}
                    onClick={() => void retry(incident.id)}
                    icon={
                      retrying === incident.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )
                    }
                  >
                    Riprova
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OperationalMetric({
  icon: Icon,
  label,
  value,
  detail,
  danger,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  detail: string;
  danger: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        danger ? "border-red-200 bg-red-50/60" : "border-gray-200 bg-gray-50/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${danger ? "text-red-600" : "text-gray-500"}`} />
        <span
          className={`text-lg font-bold ${danger ? "text-red-700" : "text-gray-950"}`}
        >
          {value}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold text-gray-800">{label}</p>
      <p className="mt-1 text-[10px] text-gray-500">{detail}</p>
    </div>
  );
}
