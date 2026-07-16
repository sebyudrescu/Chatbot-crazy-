"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  CircleX,
  Clock3,
  Code2,
  Loader2,
  Play,
  Plus,
  Send,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/Button";

interface Agent {
  id: string;
  companyName: string;
}
interface Execution {
  id: string;
  success: boolean;
  status: "pending" | "success" | "failed";
  output?: string;
  error?: string;
  durationMs?: number;
  createdAt: string;
}
interface Simulation {
  matched: boolean;
  effect: string;
  extracted: Record<string, string>;
  safePreview: true;
}
interface Action {
  id: string;
  name: string;
  type: string;
  description?: string;
  triggerKeywords: string[];
  config: Record<string, string>;
  enabled: boolean;
  executions: Execution[];
}
const types = [
  {
    id: "booking_link",
    name: "Prenotazione",
    text: "Mostra un pulsante verso Calendly o un calendario.",
    icon: Calendar,
  },
  {
    id: "collect_lead",
    name: "Raccogli contatto",
    text: "Salva email o telefono trovati nel messaggio.",
    icon: UserRoundCheck,
  },
  {
    id: "handoff",
    name: "Passa a operatore",
    text: "Segnala la conversazione nella inbox umana.",
    icon: Users,
  },
  {
    id: "webhook",
    name: "Webhook",
    text: "Invia i dati a un endpoint HTTPS esterno.",
    icon: Code2,
  },
];
export default function ActionsPage() {
  const [agents, setAgents] = useState<Agent[]>([]),
    [botId, setBotId] = useState(""),
    [actions, setActions] = useState<Action[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [testAction, setTestAction] = useState<Action | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState("");
  const [testResult, setTestResult] = useState<Simulation | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "booking_link",
    keywords: "",
    url: "",
    label: "",
    reason: "",
  });
  useEffect(() => {
    fetch("/api/chatbots")
      .then((r) => r.json())
      .then((result) => {
        const list = result.data || [];
        setAgents(list);
        if (list[0]) setBotId(list[0].id);
      });
  }, []);
  const load = useCallback(async () => {
    if (!botId) return;
    const result = await fetch(`/api/actions?botId=${botId}`).then((r) =>
      r.json(),
    );
    setActions(result.data || []);
  }, [botId]);
  useEffect(() => {
    load();
  }, [load]);
  const create = async () => {
    setBusy(true);
    setError("");
    const config =
      form.type === "booking_link"
        ? { url: form.url, label: form.label || "Prenota appuntamento" }
        : form.type === "webhook"
          ? { url: form.url }
          : form.type === "handoff"
            ? { reason: form.reason || "Richiesta operatore" }
            : {};
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botId,
        name: form.name,
        type: form.type,
        triggerKeywords: form.keywords
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        config,
      }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error);
    else {
      setOpen(false);
      setForm({
        name: "",
        type: "booking_link",
        keywords: "",
        url: "",
        label: "",
        reason: "",
      });
      await load();
    }
    setBusy(false);
  };
  const toggle = async (action: Action) => {
    await fetch(`/api/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !action.enabled }),
    });
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Eliminare definitivamente questa azione?")) return;
    await fetch(`/api/actions/${id}`, { method: "DELETE" });
    load();
  };
  const runTest = async () => {
    if (!testAction || !testMessage.trim()) return;
    setTestBusy(true);
    setTestError("");
    setTestResult(null);
    try {
      const response = await fetch(`/api/actions/${testAction.id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Simulazione non riuscita");
      setTestResult(result.data);
    } catch (caught) {
      setTestError(
        caught instanceof Error ? caught.message : "Simulazione non riuscita",
      );
    } finally {
      setTestBusy(false);
    }
  };
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] p-4 lg:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Agent tools</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Actions</h1>
            <p className="mt-1 text-sm text-gray-500">
              Permetti agli agenti di raccogliere lead, prenotare, trasferire e
              chiamare servizi reali.
            </p>
          </div>
          <Button
            onClick={() => setOpen(true)}
            disabled={!botId}
            icon={<Plus className="h-4 w-4" />}
          >
            Nuova azione
          </Button>
        </div>
        <div className="mt-6 card p-4">
          <label className="label">Agente</label>
          <select
            className="input max-w-md"
            value={botId}
            onChange={(e) => setBotId(e.target.value)}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.companyName}
              </option>
            ))}
          </select>
        </div>
        {!actions.length ? (
          <div className="card mt-5 flex min-h-96 flex-col items-center justify-center text-center">
            <Send className="h-9 w-9 text-brand-600" />
            <h2 className="mt-3 text-sm font-semibold">
              Nessuna azione configurata
            </h2>
            <p className="mt-1 max-w-sm text-xs leading-5 text-gray-500">
              Crea operazioni attivate da parole chiave. Ogni esecuzione verrà
              registrata e verificabile.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {actions.map((action) => {
              const definition =
                types.find((item) => item.id === action.type) || types[0];
              return (
                <article key={action.id} className="card p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <definition.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold">{action.name}</h2>
                        <button
                          onClick={() => toggle(action)}
                          className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${action.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          {action.enabled ? "Attiva" : "Pausa"}
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {definition.text}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setTestAction(action);
                          setTestResult(null);
                          setTestError("");
                        }}
                        className="rounded-lg p-2 text-brand-600 hover:bg-brand-50"
                        aria-label={`Testa ${action.name}`}
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(action.id)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Elimina ${action.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {action.triggerKeywords.map((word) => (
                      <span
                        key={word}
                        className="rounded-md bg-gray-50 px-2 py-1 text-[9px] text-gray-600"
                      >
                        “{word}”
                      </span>
                    ))}
                  </div>
                  <ActionHistory executions={action.executions} />
                </article>
              );
            })}
          </div>
        )}
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-hard">
              <p className="eyebrow">Nuova automazione</p>
              <h2 className="mt-1 text-xl font-bold">Configura un’azione</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {types.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setForm({ ...form, type: type.id })}
                    className={`rounded-xl border p-4 text-left ${form.type === type.id ? "border-brand-400 bg-brand-50" : "border-gray-200"}`}
                  >
                    <type.icon className="h-4 w-4 text-brand-600" />
                    <p className="mt-2 text-xs font-semibold">{type.name}</p>
                    <p className="mt-1 text-[10px] leading-4 text-gray-500">
                      {type.text}
                    </p>
                  </button>
                ))}
              </div>
              <div className="mt-5 space-y-3">
                <label className="block">
                  <span className="label">Nome azione</span>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="label">
                    Parole di attivazione, separate da virgola
                  </span>
                  <input
                    className="input"
                    value={form.keywords}
                    onChange={(e) =>
                      setForm({ ...form, keywords: e.target.value })
                    }
                    placeholder="prenota, appuntamento, consulenza"
                  />
                </label>
                {(form.type === "booking_link" || form.type === "webhook") && (
                  <label className="block">
                    <span className="label">URL HTTPS</span>
                    <input
                      className="input"
                      type="url"
                      value={form.url}
                      onChange={(e) =>
                        setForm({ ...form, url: e.target.value })
                      }
                      placeholder="https://..."
                    />
                  </label>
                )}
                {form.type === "booking_link" && (
                  <label className="block">
                    <span className="label">Testo pulsante</span>
                    <input
                      className="input"
                      value={form.label}
                      onChange={(e) =>
                        setForm({ ...form, label: e.target.value })
                      }
                      placeholder="Prenota ora"
                    />
                  </label>
                )}
                {form.type === "handoff" && (
                  <label className="block">
                    <span className="label">Motivo handoff</span>
                    <input
                      className="input"
                      value={form.reason}
                      onChange={(e) =>
                        setForm({ ...form, reason: e.target.value })
                      }
                    />
                  </label>
                )}
                {error && (
                  <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
                    {error}
                  </p>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Annulla
                </Button>
                <Button
                  onClick={create}
                  disabled={busy || !form.name.trim() || !form.keywords.trim()}
                  icon={
                    busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )
                  }
                >
                  Crea azione
                </Button>
              </div>
            </div>
          </div>
        )}
        {testAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-hard">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Safe preview</p>
                  <h2 className="mt-1 text-xl font-bold">
                    Testa {testAction.name}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    Nessun webhook, contatto o handoff verrà eseguito realmente.
                  </p>
                </div>
                <button
                  onClick={() => setTestAction(null)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                  aria-label="Chiudi test azione"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <label className="mt-5 block">
                <span className="label">Messaggio di prova</span>
                <textarea
                  className="textarea"
                  rows={3}
                  value={testMessage}
                  onChange={(event) => setTestMessage(event.target.value)}
                  placeholder={`Inserisci un messaggio con una parola come “${testAction.triggerKeywords[0]}”`}
                />
              </label>
              <Button
                className="mt-3"
                onClick={runTest}
                loading={testBusy}
                disabled={!testMessage.trim()}
                icon={<Play className="h-4 w-4" />}
              >
                Avvia simulazione
              </Button>
              {testError && (
                <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                  {testError}
                </p>
              )}
              {testResult && <ActionSimulationResult result={testResult} />}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ActionHistory({ executions }: { executions: Execution[] }) {
  if (!executions.length) {
    return (
      <p className="mt-4 rounded-lg bg-gray-50 p-3 text-[10px] text-gray-400">
        Nessuna esecuzione registrata.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
          Ultime esecuzioni
        </p>
        <span className="text-[9px] text-gray-400">{executions.length}/10</span>
      </div>
      {executions.slice(0, 3).map((execution) => {
        const pending = execution.status === "pending";
        const success = execution.status === "success";
        const Icon = pending ? Clock3 : success ? CheckCircle2 : CircleX;
        return (
          <div
            key={execution.id}
            className={`rounded-lg p-3 text-[10px] ${
              pending
                ? "bg-amber-50 text-amber-700"
                : success
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {pending
                  ? "Esecuzione in corso"
                  : success
                    ? execution.output || "Completata"
                    : execution.error || "Esecuzione fallita"}
              </span>
              <span className="shrink-0 opacity-60">
                {execution.durationMs || 0} ms
              </span>
            </div>
            <p className="mt-1 pl-5 opacity-60">
              {new Date(execution.createdAt).toLocaleString("it-IT")}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ActionSimulationResult({ result }: { result: Simulation }) {
  return (
    <section className="mt-5 border-t pt-5">
      <div
        className={`rounded-xl p-4 ${
          result.matched
            ? "bg-emerald-50 text-emerald-800"
            : "bg-amber-50 text-amber-800"
        }`}
      >
        <p className="text-xs font-semibold">
          {result.matched
            ? "L’azione verrebbe attivata"
            : "L’azione non verrebbe attivata"}
        </p>
        <p className="mt-1 text-[10px] leading-4 opacity-75">{result.effect}</p>
      </div>
      {Object.keys(result.extracted).length > 0 && (
        <div className="mt-3 rounded-xl border border-gray-100 p-4">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
            Dati rilevati
          </p>
          <dl className="mt-2 space-y-2">
            {Object.entries(result.extracted).map(([key, value]) => (
              <div key={key} className="flex gap-3 text-xs">
                <dt className="w-20 capitalize text-gray-400">{key}</dt>
                <dd className="min-w-0 flex-1 break-all font-medium text-gray-700">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
