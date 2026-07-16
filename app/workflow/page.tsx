"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Braces,
  CircleCheck,
  CircleX,
  Clock3,
  GitBranch,
  Hand,
  MessageSquare,
  Play,
  Plus,
  Save,
  Tag,
  Trash2,
  UserRoundCheck,
  Webhook,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type StepType =
  | "condition"
  | "collect"
  | "message"
  | "webhook"
  | "handoff"
  | "tag"
  | "end";
interface Step {
  id: string;
  type: StepType;
  title: string;
  config: Record<string, unknown>;
}
interface Execution {
  id: string;
  status: "running" | "success" | "skipped" | "failed";
  actions: string[];
  error?: string | null;
  durationMs?: number | null;
  createdAt: string;
}
interface Flow {
  id: string;
  botId: string;
  name: string;
  description?: string | null;
  triggerType: "new_message" | "intent" | "keyword" | "manual";
  steps: Step[];
  isActive: boolean;
  executions?: Execution[];
  chatbot?: { companyName: string };
}
interface Agent {
  id: string;
  companyName: string;
}
interface Simulation {
  matched: boolean;
  actions: string[];
  responsePreview?: string;
  steps: Array<{
    id: string;
    title: string;
    status: "matched" | "planned" | "skipped";
    detail: string;
  }>;
}
const palette: [StepType, string, typeof Bot][] = [
  ["condition", "Condizione", GitBranch],
  ["collect", "Raccogli dati", Braces],
  ["message", "Invia messaggio", MessageSquare],
  ["handoff", "Passa a operatore", UserRoundCheck],
  ["tag", "Aggiungi tag", Tag],
  ["webhook", "Chiama webhook", Webhook],
  ["end", "Fine", Hand],
];
const defaults: Record<StepType, Record<string, unknown>> = {
  condition: { field: "message", operator: "contains", value: "" },
  collect: { field: "email" },
  message: { content: "Come posso aiutarti?" },
  webhook: { url: "", method: "POST" },
  handoff: { reason: "Richiesta gestita dal workflow" },
  tag: { tag: "lead" },
  end: {},
};

export default function WorkflowPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<Simulation | null>(null);
  const [testError, setTestError] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const selected = useMemo(
    () => flows.find((flow) => flow.id === selectedId) || null,
    [flows, selectedId],
  );
  const load = useCallback(async () => {
    const [botsRes, flowsRes] = await Promise.all([
      fetch("/api/chatbots").then((r) => r.json()),
      fetch("/api/workflows").then((r) => r.json()),
    ]);
    setAgents(botsRes.success ? botsRes.data : []);
    const list = flowsRes.success ? flowsRes.data : [];
    setFlows(list);
    setSelectedId((current) => current || list[0]?.id || "");
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const create = async () => {
    if (!agents[0]) return;
    const response = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botId: agents[0].id,
        name: "Nuovo workflow",
        triggerType: "new_message",
        steps: [],
      }),
    });
    const result = await response.json();
    if (result.success) {
      setFlows((current) => [result.data, ...current]);
      setSelectedId(result.data.id);
    }
  };
  const change = (data: Partial<Flow>) =>
    setFlows((current) =>
      current.map((flow) =>
        flow.id === selectedId ? { ...flow, ...data } : flow,
      ),
    );
  const add = (type: StepType) => {
    if (!selected) return;
    const label = palette.find((item) => item[0] === type)?.[1] || type;
    change({
      steps: [
        ...selected.steps,
        {
          id: crypto.randomUUID(),
          type,
          title: label,
          config: { ...defaults[type] },
        },
      ],
    });
  };
  const updateStep = (id: string, data: Partial<Step>) => {
    if (selected)
      change({
        steps: selected.steps.map((step) =>
          step.id === id ? { ...step, ...data } : step,
        ),
      });
  };
  const move = (index: number, direction: -1 | 1) => {
    if (!selected) return;
    const target = index + direction;
    if (target < 0 || target >= selected.steps.length) return;
    const steps = [...selected.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    change({ steps });
  };
  const remove = (id: string) => {
    if (selected)
      change({ steps: selected.steps.filter((step) => step.id !== id) });
  };
  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/workflows/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selected.name,
          description: selected.description,
          triggerType: selected.triggerType,
          steps: selected.steps,
          isActive: selected.isActive,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Salvataggio non riuscito");
      setNotice({
        text: "Workflow salvato e pronto per il motore.",
        error: false,
      });
    } catch (error) {
      setNotice({
        text:
          error instanceof Error ? error.message : "Salvataggio non riuscito.",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };
  const runTest = async () => {
    if (!selected || !testMessage.trim()) return;
    setTestBusy(true);
    setTestError("");
    setTestResult(null);
    try {
      const response = await fetch(`/api/workflows/${selected.id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testMessage,
          triggerType: selected.triggerType,
          steps: selected.steps,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Simulazione non riuscita");
      setTestResult(result.data);
    } catch (error) {
      setTestError(
        error instanceof Error ? error.message : "Simulazione non riuscita",
      );
    } finally {
      setTestBusy(false);
    }
  };
  const removeFlow = async () => {
    if (!selected || !confirm(`Eliminare “${selected.name}”?`)) return;
    await fetch(`/api/workflows/${selected.id}`, { method: "DELETE" });
    setFlows((current) => current.filter((flow) => flow.id !== selected.id));
    setSelectedId(flows.find((flow) => flow.id !== selected.id)?.id || "");
  };
  if (loading)
    return (
      <DashboardLayout>
        <LoadingSpinner fullPage text="Caricamento workflow..." />
      </DashboardLayout>
    );
  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] min-h-[720px] overflow-hidden">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-white">
          <div className="border-b p-5">
            <p className="eyebrow">Automation studio</p>
            <div className="mt-1 flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-950">Workflow</h1>
              <button
                onClick={create}
                className="rounded-lg bg-brand-600 p-2 text-white"
                aria-label="Nuovo workflow"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-gray-400">
              Automazioni private per gli agenti dei clienti.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {flows.map((flow) => (
              <button
                key={flow.id}
                onClick={() => setSelectedId(flow.id)}
                className={`mb-2 w-full rounded-xl border p-3 text-left ${selectedId === flow.id ? "border-brand-200 bg-brand-50" : "border-gray-100 hover:bg-gray-50"}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${flow.isActive ? "bg-emerald-500" : "bg-gray-300"}`}
                  />
                  <p className="truncate text-xs font-semibold text-gray-800">
                    {flow.name}
                  </p>
                </div>
                <p className="mt-1 truncate text-[9px] text-gray-400">
                  {flow.chatbot?.companyName ||
                    agents.find((a) => a.id === flow.botId)?.companyName}{" "}
                  · {flow.steps.length} passi
                </p>
              </button>
            ))}
            {!flows.length && (
              <div className="p-6 text-center text-xs text-gray-400">
                Crea il primo workflow.
              </div>
            )}
          </div>
        </aside>
        {selected ? (
          <>
            <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f7fa]">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <WorkflowIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <input
                      value={selected.name}
                      onChange={(e) => change({ name: e.target.value })}
                      className="w-full border-0 bg-transparent text-sm font-semibold text-gray-950 outline-none"
                    />
                    <p className="text-[9px] text-gray-400">
                      {selected.steps.length} passi · trigger{" "}
                      {selected.triggerType}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setTestOpen(true);
                      setTestResult(null);
                      setTestError("");
                    }}
                    icon={<Play className="h-4 w-4" />}
                  >
                    Test workflow
                  </Button>
                  <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-semibold">
                    <input
                      type="checkbox"
                      checked={selected.isActive}
                      onChange={(e) => change({ isActive: e.target.checked })}
                      className="accent-brand-600"
                    />
                    Attivo
                  </label>
                  <Button
                    size="sm"
                    onClick={save}
                    loading={saving}
                    icon={<Save className="h-4 w-4" />}
                  >
                    Salva e attiva
                  </Button>
                </div>
              </div>
              {notice && (
                <div
                  className={`mx-6 mt-4 rounded-lg px-4 py-3 text-xs ${
                    notice.error
                      ? "bg-red-50 text-red-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {notice.text}
                </div>
              )}
              <div className="mx-auto max-w-3xl p-8">
                <div className="flex justify-center">
                  <Node
                    icon={Bot}
                    title="Trigger"
                    subtitle={triggerLabel(selected.triggerType)}
                  />
                </div>
                <Connector />
                {selected.steps.map((step, index) => (
                  <div key={step.id}>
                    <StepNode
                      step={step}
                      index={index}
                      total={selected.steps.length}
                      onChange={(data) => updateStep(step.id, data)}
                      onMove={(direction) => move(index, direction)}
                      onRemove={() => remove(step.id)}
                    />
                    {index < selected.steps.length - 1 && <Connector />}
                  </div>
                ))}
                {selected.steps.length > 0 && <Connector />}
                <div className="flex justify-center">
                  <button
                    onClick={() => add("end")}
                    className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-xs text-gray-500 hover:border-brand-300"
                  >
                    <Plus className="h-4 w-4" />
                    Aggiungi passo dalla palette
                  </button>
                </div>
              </div>
            </main>
            <aside className="w-72 shrink-0 overflow-y-auto border-l bg-white p-4">
              <h2 className="text-xs font-semibold text-gray-900">
                Aggiungi passo
              </h2>
              <div className="mt-3 space-y-2">
                {palette.map(([type, label, Icon]) => (
                  <button
                    key={type}
                    onClick={() => add(type)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-100 p-3 text-left hover:border-brand-200 hover:bg-brand-50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-brand-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] font-medium text-gray-700">
                      {label}
                    </span>
                  </button>
                ))}
              </div>
              <div className="my-5 border-t" />
              <label className="text-[10px] font-medium text-gray-500">
                Agente
                <select
                  value={selected.botId}
                  onChange={(e) => change({ botId: e.target.value })}
                  className="input mt-1 text-xs"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.companyName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-[10px] font-medium text-gray-500">
                Trigger
                <select
                  value={selected.triggerType}
                  onChange={(e) =>
                    change({
                      triggerType: e.target.value as Flow["triggerType"],
                    })
                  }
                  className="input mt-1 text-xs"
                >
                  <option value="new_message">Ogni nuovo messaggio</option>
                  <option value="keyword">Parola chiave</option>
                  <option value="intent">Intento rilevato</option>
                  <option value="manual">Avvio manuale</option>
                </select>
              </label>
              <ExecutionHistory executions={selected.executions || []} />
              <Button
                className="mt-6"
                variant="danger"
                size="sm"
                fullWidth
                onClick={removeFlow}
                icon={<Trash2 className="h-4 w-4" />}
              >
                Elimina workflow
              </Button>
            </aside>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Crea o seleziona un workflow.
          </div>
        )}
      </div>
      {testOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-hard">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Safe preview</p>
                <h2 className="mt-1 text-xl font-bold">Testa il workflow</h2>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Simula il percorso senza inviare webhook o modificare dati
                  reali.
                </p>
              </div>
              <button
                onClick={() => setTestOpen(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                aria-label="Chiudi test workflow"
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
                placeholder="Es. Vorrei ricevere un preventivo"
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
            {testResult && <SimulationResult result={testResult} />}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
function SimulationResult({ result }: { result: Simulation }) {
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
            ? "Il workflow verrebbe eseguito"
            : "Il workflow non verrebbe eseguito"}
        </p>
        <p className="mt-1 text-[10px] opacity-75">
          {result.actions.length
            ? `Azioni previste: ${result.actions.join(", ")}`
            : "Nessun effetto previsto"}
        </p>
      </div>
      <div className="mt-3 space-y-2">
        {result.steps.map((step, index) => (
          <div
            key={`${step.id}-${index}`}
            className="flex gap-3 rounded-xl border border-gray-100 p-3"
          >
            <div
              className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                step.status === "skipped" ? "bg-amber-400" : "bg-emerald-500"
              }`}
            />
            <div>
              <p className="text-xs font-semibold text-gray-800">
                {step.title}
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-gray-500">
                {step.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
      {result.responsePreview && (
        <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
          <p className="text-[9px] font-bold uppercase tracking-wider text-brand-600">
            Risposta prevista
          </p>
          <p className="mt-2 text-xs leading-5 text-gray-700">
            {result.responsePreview}
          </p>
        </div>
      )}
    </section>
  );
}
function ExecutionHistory({ executions }: { executions: Execution[] }) {
  return (
    <section className="mt-5 border-t pt-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-900">
          Ultime esecuzioni
        </h2>
        <span className="text-[9px] text-gray-400">{executions.length}/10</span>
      </div>
      <div className="mt-3 space-y-2">
        {executions.slice(0, 5).map((execution) => {
          const failed = execution.status === "failed";
          const success = execution.status === "success";
          const Icon = failed ? CircleX : success ? CircleCheck : Clock3;
          return (
            <div
              key={execution.id}
              className="rounded-lg border border-gray-100 p-2.5"
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-3.5 w-3.5 ${
                    failed
                      ? "text-red-500"
                      : success
                        ? "text-emerald-500"
                        : "text-amber-500"
                  }`}
                />
                <span className="text-[10px] font-semibold capitalize text-gray-700">
                  {execution.status}
                </span>
                <span className="ml-auto text-[9px] text-gray-400">
                  {execution.durationMs ?? 0} ms
                </span>
              </div>
              {execution.actions.length > 0 && (
                <p className="mt-1 truncate text-[9px] text-gray-400">
                  {execution.actions.join(" · ")}
                </p>
              )}
              {execution.error && (
                <p className="mt-1 line-clamp-2 text-[9px] text-red-500">
                  {execution.error}
                </p>
              )}
            </div>
          );
        })}
        {!executions.length && (
          <p className="rounded-lg bg-gray-50 p-3 text-[9px] leading-4 text-gray-400">
            Lo storico apparirà dopo il primo messaggio che valuta questo
            workflow.
          </p>
        )}
      </div>
    </section>
  );
}
function triggerLabel(type: Flow["triggerType"]) {
  return {
    new_message: "Nuovo messaggio",
    keyword: "Parola chiave",
    intent: "Intento rilevato",
    manual: "Avvio manuale",
  }[type];
}
function Connector() {
  return <div className="mx-auto h-8 w-px bg-gray-300" />;
}
function Node({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Bot;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex w-72 items-center gap-3 rounded-xl border border-brand-200 bg-white p-4 shadow-soft">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-900">{title}</p>
        <p className="text-[9px] text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}
function StepNode({
  step,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  step: Step;
  index: number;
  total: number;
  onChange: (data: Partial<Step>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const meta = palette.find((item) => item[0] === step.type)!;
  const Icon = meta[2];
  return (
    <div className="mx-auto w-[520px] rounded-xl border bg-white p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-brand-600">
          <Icon className="h-4 w-4" />
        </div>
        <input
          value={step.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="min-w-0 flex-1 border-0 text-xs font-semibold outline-none"
        />
        <button
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <StepConfig step={step} onChange={(config) => onChange({ config })} />
    </div>
  );
}
function StepConfig({
  step,
  onChange,
}: {
  step: Step;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) =>
    onChange({ ...step.config, [key]: value });
  if (step.type === "condition")
    return (
      <div className="mt-3 grid grid-cols-3 gap-2">
        <select
          className="input py-2 text-[10px]"
          value={String(step.config.field || "message")}
          onChange={(e) => set("field", e.target.value)}
        >
          <option value="message">Messaggio</option>
          <option value="intent">Intento</option>
          <option value="sentiment">Sentiment</option>
        </select>
        <select
          className="input py-2 text-[10px]"
          value={String(step.config.operator || "contains")}
          onChange={(e) => set("operator", e.target.value)}
        >
          <option value="contains">Contiene</option>
          <option value="equals">È uguale a</option>
          <option value="not_contains">Non contiene</option>
        </select>
        <input
          className="input py-2 text-[10px]"
          value={String(step.config.value || "")}
          onChange={(e) => set("value", e.target.value)}
          placeholder="Valore"
        />
      </div>
    );
  if (step.type === "message")
    return (
      <textarea
        className="textarea mt-3 text-[10px]"
        rows={2}
        value={String(step.config.content || "")}
        onChange={(e) => set("content", e.target.value)}
        placeholder="Messaggio da inviare"
      />
    );
  if (step.type === "collect")
    return (
      <select
        className="input mt-3 py-2 text-[10px]"
        value={String(step.config.field || "email")}
        onChange={(e) => set("field", e.target.value)}
      >
        <option value="email">Email</option>
        <option value="phone">Telefono</option>
        <option value="name">Nome</option>
      </select>
    );
  if (step.type === "webhook")
    return (
      <div className="mt-3 flex gap-2">
        <select
          className="input w-24 py-2 text-[10px]"
          value={String(step.config.method || "POST")}
          onChange={(e) => set("method", e.target.value)}
        >
          <option>POST</option>
          <option>GET</option>
        </select>
        <input
          className="input py-2 text-[10px]"
          value={String(step.config.url || "")}
          onChange={(e) => set("url", e.target.value)}
          placeholder="https://..."
        />
      </div>
    );
  if (step.type === "tag")
    return (
      <input
        className="input mt-3 py-2 text-[10px]"
        value={String(step.config.tag || "")}
        onChange={(e) => set("tag", e.target.value)}
        placeholder="Tag"
      />
    );
  if (step.type === "handoff")
    return (
      <input
        className="input mt-3 py-2 text-[10px]"
        value={String(step.config.reason || "")}
        onChange={(e) => set("reason", e.target.value)}
        placeholder="Motivo handoff"
      />
    );
  return <p className="mt-2 text-[9px] text-gray-400">Termina il workflow.</p>;
}
