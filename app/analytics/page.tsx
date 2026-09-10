"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  MessageSquare,
  MousePointerClick,
  Radio,
  SearchX,
  ShoppingCart,
  Star,
  ThumbsDown,
  TrendingUp,
  UserPlus,
  UserRoundCheck,
  Users,
  Zap,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
interface PeriodComparison {
  current: number;
  previous: number;
  changePercent: number | null;
}
interface Data {
  periodDays: number;
  summary: {
    conversations: number;
    messages: number;
    resolved: number;
    handoffs: number;
    identifiedContacts: number;
    positiveFeedback: number;
    negativeFeedback: number;
    satisfaction: number | null;
    averageMessages: number;
  };
  intents: { label: string; value: number }[];
  sentiments: { label: string; value: number }[];
  byAgent: {
    id: string;
    name: string;
    conversations: number;
    messages: number;
    resolved: number;
    handoffs: number;
  }[];
  daily: { date: string; value: number }[];
  attention: {
    id: string;
    name: string;
    agent: string;
    reason: string | null;
    lastInteraction: string;
  }[];
  negativeFeedback: {
    id: string;
    conversationId: string;
    feedbackComment: string | null;
    content: string;
    createdAt: string;
  }[];
  pipeline: {
    stages: {
      stage: string;
      calls: number;
      successes: number;
      totalLatencyMs: number;
      averageLatencyMs: number;
      successRate: number;
      totalCostUsd: number;
      totalTokens: number;
    }[];
    aiCostUsd: number;
    aiTokens: number;
    aiCalls: number;
  };
  commercial: {
    period: { currentStart: string; currentEnd: string; previousStart: string };
    comparison: {
      conversations: PeriodComparison;
      messages: PeriodComparison;
      newContacts: PeriodComparison;
      productSearches: PeriodComparison;
      noMatches: PeriodComparison;
      conversions: PeriodComparison;
    };
    funnel: {
      stages: {
        stage: string;
        conversations: number;
        fromPreviousPercent: number | null;
        fromImpressionPercent: number | null;
        comparison: PeriodComparison;
      }[];
      revenue: { currency: string; value: number }[];
      previousRevenue: { currency: string; value: number }[];
    };
    leads: {
      total: number;
      activeInPeriod: number;
      created: PeriodComparison;
      stages: { stage: string; contacts: number }[];
    };
    noMatch: {
      searches: number;
      noMatches: number;
      ratePercent: number | null;
      rateChangePoints: number | null;
      previous: {
        searches: number;
        noMatches: number;
        ratePercent: number | null;
      };
    };
    channels: {
      channel: string;
      conversations: number;
      engagedConversations: number;
      leads: number;
      conversions: number;
      conversionRatePercent: number | null;
    }[];
    actions: {
      actionId: string;
      botId: string;
      name: string;
      type: string;
      executions: number;
      successes: number;
      failures: number;
      pending: number;
      conversations: number;
      successRatePercent: number | null;
      averageLatencyMs: number | null;
    }[];
    dataQuality: { complete: boolean; truncatedSources: string[] };
    note: string;
  };
  helpdesk: {
    backlog: number;
    overdueFirstResponse: number;
    overdueResolution: number;
    firstResponseAttainment: number | null;
    resolutionAttainment: number | null;
    firstResponseMedianMs: number | null;
    firstResponseP90Ms: number | null;
    resolutionMedianMs: number | null;
    resolutionP90Ms: number | null;
    byPriority: { label: string; value: number }[];
    byChannel: { label: string; value: number }[];
  };
}
interface Agent {
  id: string;
  companyName: string;
}
export default function AnalyticsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [days, setDays] = useState(30);
  const [botId, setBotId] = useState("all");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [clientMode, setClientMode] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      fetch("/api/chatbots"),
      fetch("/api/auth/me", { cache: "no-store" }),
    ])
      .then(async ([bots, me]) => Promise.all([bots.json(), me.json()]))
      .then(([result, account]) => {
        if (!result.success || !account.success)
          throw new Error("Account non disponibile");
        const visible = result.success ? result.data : [];
        setAgents(visible);
        setClientMode(account.data?.mode === "client");
        const requested = new URLSearchParams(window.location.search).get(
          "botId",
        );
        if (requested && visible.some((agent: Agent) => agent.id === requested))
          setBotId(requested);
        else if (account.data?.mode === "client" && visible.length === 1)
          setBotId(visible[0].id);
        setAccountReady(true);
      })
      .catch(() => {
        setError("Non riesco a caricare il tuo account. Riprova tra poco.");
        setLoading(false);
      });
  }, [retry]);
  useEffect(() => {
    if (!accountReady) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ days: String(days) });
    if (botId !== "all") query.set("botId", botId);
    fetch(`/api/analytics?${query}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((result) => {
        if (!result.success || !result.data)
          throw new Error("Risultati non disponibili");
        setData(result.data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setData(null);
        setError(
          "I risultati non sono disponibili in questo momento. Nessun dato è stato perso: riprova.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, botId, accountReady, retry]);
  if (error)
    return (
      <DashboardLayout>
        <div role="alert" className="mx-auto max-w-xl p-6">
          <h1 className="text-xl font-semibold">
            Impossibile caricare i risultati
          </h1>
          <p className="mt-3 text-sm text-gray-600">{error}</p>
          <button
            className="btn-primary mt-4"
            onClick={() => {
              setError(null);
              setLoading(true);
              setRetry((value) => value + 1);
            }}
          >
            Riprova
          </button>
        </div>
      </DashboardLayout>
    );
  if (loading || !data || !accountReady)
    return (
      <DashboardLayout>
        <LoadingSpinner fullPage text="Calcolo risultati..." />
      </DashboardLayout>
    );
  const s = data.summary;
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] p-5 lg:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">
              {clientMode ? "Andamento chatbot" : "Quality intelligence"}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-gray-950">
              {clientMode ? "Risultati" : "Analytics"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {clientMode
                ? "Guarda quante persone usano il chatbot e dove puoi migliorare."
                : "Prestazioni reali degli agenti, qualità delle risposte e problemi da correggere."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Chatbot"
              value={botId}
              onChange={(e) => setBotId(e.target.value)}
              className="input w-56 text-xs"
            >
              <option value="all">
                {clientMode ? "Tutti i chatbot" : "Tutti i clienti"}
              </option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.companyName}
                </option>
              ))}
            </select>
            <select
              aria-label="Periodo analytics"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="input w-44 text-xs"
            >
              <option value={7}>Ultimi 7 giorni</option>
              <option value={30}>Ultimi 30 giorni</option>
              <option value={90}>Ultimi 90 giorni</option>
              <option value={365}>Ultimo anno</option>
            </select>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-3">
          <Metric
            icon={MessageSquare}
            label="Conversazioni"
            value={s.conversations}
            description="Chat iniziate nel periodo selezionato."
          />
          <Metric
            icon={TrendingUp}
            label="Messaggi"
            value={s.messages}
            description="Messaggi delle chat iniziate nel periodo selezionato."
          />
          <Metric
            icon={CheckCircle2}
            label={clientMode ? "Chat concluse" : "Risoluzione"}
            description="Conversazioni contrassegnate come risolte, non semplicemente chiuse dal visitatore."
            value={
              clientMode
                ? s.resolved
                : s.conversations
                  ? `${Math.round((s.resolved / s.conversations) * 100)}%`
                  : "—"
            }
          />
          <Metric
            icon={Star}
            label="Soddisfazione"
            value={s.satisfaction === null ? "—" : `${s.satisfaction}%`}
            description={
              s.positiveFeedback + s.negativeFeedback
                ? `${s.positiveFeedback} valutazioni positive su ${s.positiveFeedback + s.negativeFeedback} ricevute. Non rappresenta tutte le chat.`
                : "Nessuna valutazione ricevuta: la soddisfazione non è ancora misurabile."
            }
          />
          <Metric
            icon={UserRoundCheck}
            label={clientMode ? "Richieste al team" : "Handoff"}
            value={s.handoffs}
            description="Chat del periodo che richiedono assistenza umana."
          />
          <Metric
            icon={Users}
            label={
              clientMode ? "Contatti riconoscibili" : "Contatti identificati"
            }
            value={s.identifiedContacts}
            description="Contatti con email o telefono e un’interazione nel periodo. Non indica il numero di acquisti."
          />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Conversazioni nel tempo
                </h2>
                <p className="mt-1 text-[10px] text-gray-400">
                  Andamento giornaliero
                </p>
              </div>
              <span className="text-[10px] font-semibold text-brand-600">
                MEDIA {s.averageMessages} MESSAGGI/CHAT
              </span>
            </div>
            <DailyChart points={data.daily} />
          </section>
          <Distribution
            title={
              clientMode ? "Cosa chiedono le persone" : "Intenti principali"
            }
            items={data.intents}
            total={s.conversations}
            friendly={clientMode}
          />
        </div>
        <div
          className={`mt-5 grid gap-5 ${clientMode ? "" : "xl:grid-cols-2"}`}
        >
          {!clientMode ? <AgentTable agents={data.byAgent} /> : null}
          <Distribution
            title={
              clientMode ? "Tono delle conversazioni" : "Sentiment rilevato"
            }
            items={data.sentiments}
            total={s.conversations}
            friendly={clientMode}
          />
        </div>
        <CommercialPanel commercial={data.commercial} clientMode={clientMode} />
        {!clientMode ? (
          <ChannelActionPanel commercial={data.commercial} />
        ) : null}
        {!clientMode ? <HelpDeskPanel helpdesk={data.helpdesk} /> : null}
        {!clientMode ? <PipelinePanel pipeline={data.pipeline} /> : null}
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section className="card overflow-hidden">
            <div className="border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <UserRoundCheck className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-900">
                  Conversazioni da gestire
                </h2>
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                Richieste in attesa dell’intervento del team
              </p>
            </div>
            <div className="divide-y">
              {data.attention.map((item) => (
                <Link
                  href={`/conversations?conversation=${item.id}`}
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-800">
                      {item.name}
                    </p>
                    <p className="truncate text-[10px] text-gray-400">
                      {item.agent} · {item.reason || "Assistenza richiesta"}
                    </p>
                  </div>
                  <span className="text-[9px] text-gray-400">Apri</span>
                </Link>
              ))}
              {!data.attention.length && (
                <Empty text="Nessuna richiesta di assistenza aperta." />
              )}
            </div>
          </section>
          <section className="card overflow-hidden">
            <div className="border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <ThumbsDown className="h-4 w-4 text-red-500" />
                <h2 className="text-sm font-semibold text-gray-900">
                  Feedback negativi
                </h2>
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                Risposte da usare per migliorare prompt e fonti
              </p>
            </div>
            <div className="divide-y">
              {data.negativeFeedback.map((item) => (
                <Link
                  href={`/conversations?conversation=${item.conversationId}`}
                  key={item.id}
                  className="block px-5 py-3 hover:bg-gray-50"
                >
                  <p className="line-clamp-2 text-xs text-gray-700">
                    {item.content}
                  </p>
                  <p className="mt-1 text-[10px] text-red-500">
                    {item.feedbackComment || "Nessun commento aggiunto"}
                  </p>
                </Link>
              ))}
              {!data.negativeFeedback.length && (
                <Empty text="Nessun feedback negativo nel periodo." />
              )}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  description: string;
}) {
  return (
    <div className="card min-w-0 p-4">
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-500" />
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <p className="mt-4 text-2xl font-bold text-gray-950">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        {description}
      </p>
    </div>
  );
}
function DailyChart({ points }: { points: { date: string; value: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div>
      <div
        aria-hidden="true"
        className="mt-6 flex h-56 items-end gap-1 border-b border-gray-100 px-1"
      >
        {points.some((point) => point.value > 0) ? (
          points.map((point) => (
            <div
              key={point.date}
              className="group relative flex h-full min-w-0 flex-1 items-end"
            >
              <div
                className="w-full rounded-t bg-brand-500/80 transition hover:bg-brand-600"
                style={{ height: `${(point.value / max) * 100}%` }}
              />
              <div className="pointer-events-none absolute -top-10 left-1/2 hidden -translate-x-1/2 rounded bg-gray-950 px-2 py-1 text-[9px] text-white group-hover:block">
                {point.date}: {point.value}
              </div>
            </div>
          ))
        ) : (
          <p className="m-auto text-xs text-gray-400">
            Nessuna conversazione nel periodo.
          </p>
        )}
      </div>
      <details className="mt-3 text-xs text-gray-600">
        <summary className="cursor-pointer rounded py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
          Vedi i valori giorno per giorno
        </summary>
        <div className="mt-2 max-h-60 overflow-auto">
          <table className="w-full text-left">
            <caption className="sr-only">
              Conversazioni iniziate per giorno
            </caption>
            <thead>
              <tr>
                <th scope="col" className="py-2">
                  Giorno
                </th>
                <th scope="col" className="py-2 text-right">
                  Conversazioni
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date} className="border-t border-gray-100">
                  <th scope="row" className="py-2 font-normal">
                    {point.date}
                  </th>
                  <td className="py-2 text-right">{point.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!points.length && <p>Nessuna conversazione nel periodo.</p>}
        </div>
      </details>
    </div>
  );
}
function Distribution({
  title,
  items,
  total,
  friendly = false,
}: {
  title: string;
  items: { label: string; value: number }[];
  total: number;
  friendly?: boolean;
}) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <div className="mt-5 space-y-4">
        {items.slice(0, 7).map((item) => (
          <div key={item.label}>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="capitalize text-gray-600">
                {friendly ? analyticsLabel(item.label) : item.label}
              </span>
              <span className="font-semibold">{item.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{
                  width: `${Math.max(5, total ? (item.value / total) * 100 : 0)}%`,
                }}
              />
            </div>
          </div>
        ))}
        {!items.length && <Empty text="Nessun dato disponibile." />}
      </div>
    </section>
  );
}
function AgentTable({ agents }: { agents: Data["byAgent"] }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Performance per agente
        </h2>
      </div>
      <table className="w-full text-left text-[10px]">
        <thead className="bg-gray-50 uppercase tracking-wider text-gray-400">
          <tr>
            <th className="px-5 py-3">Agente</th>
            <th>Chat</th>
            <th>Messaggi</th>
            <th>Risolte</th>
            <th>Handoff</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {agents.map((item) => (
            <tr key={item.id}>
              <td className="px-5 py-3 font-semibold text-gray-700">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Bot className="h-3 w-3" />
                </span>
                {item.name}
              </td>
              <td>{item.conversations}</td>
              <td>{item.messages}</td>
              <td>{item.resolved}</td>
              <td>{item.handoffs}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!agents.length && <Empty text="Nessun agente nel periodo." />}
    </section>
  );
}
function CommercialPanel({
  commercial,
  clientMode = false,
}: {
  commercial: Data["commercial"];
  clientMode?: boolean;
}) {
  const stageLabels: Record<string, string> = {
    impression: "Prodotti mostrati",
    click: "Visite prodotto",
    add_to_cart: "Aggiunte al carrello",
    checkout: "Checkout",
    conversion: "Ordini verificati",
  };
  const stageIcons: Record<string, typeof BarChart3> = {
    impression: ShoppingCart,
    click: MousePointerClick,
    add_to_cart: ShoppingCart,
    checkout: CircleDollarSign,
    conversion: CheckCircle2,
  };
  const max = Math.max(1, commercial.funnel.stages[0]?.conversations || 0);
  return (
    <section className="card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              {clientMode
                ? "Percorso dai prodotti agli acquisti"
                : "Funnel commerciale verificato"}
            </h2>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-gray-400">
            Percorsi unici per conversazione o sessione; eventi senza identità
            restano distinti. Confronto con il periodo precedente della stessa
            durata.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {commercial.funnel.revenue.map((item) => (
            <span
              key={item.currency}
              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700"
            >
              {formatMoney(item.value, item.currency)} verificati
            </span>
          ))}
          {!commercial.funnel.revenue.length && (
            <span className="rounded-lg bg-gray-50 px-3 py-1.5 text-[10px] text-gray-500">
              Nessun ordine attribuito
            </span>
          )}
        </div>
      </div>
      {!commercial.dataQuality.complete && (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-[9px] text-amber-700">
          Volume oltre il limite del report: alcuni aggregati sono parziali (
          {commercial.dataQuality.truncatedSources.join(", ")}). Restringi
          periodo o agente.
        </div>
      )}
      <div className="grid gap-px bg-gray-100 sm:grid-cols-2 xl:grid-cols-6">
        <ComparisonMetric
          icon={MessageSquare}
          label="Conversazioni"
          comparison={commercial.comparison.conversations}
        />
        <ComparisonMetric
          icon={TrendingUp}
          label="Messaggi"
          comparison={commercial.comparison.messages}
        />
        <ComparisonMetric
          icon={UserPlus}
          label="Nuovi visitatori registrati"
          comparison={commercial.comparison.newContacts}
        />
        <ComparisonMetric
          icon={SearchX}
          label="Ricerche prodotto"
          comparison={commercial.comparison.productSearches}
        />
        <ComparisonMetric
          icon={SearchX}
          label="Nessun risultato"
          comparison={commercial.comparison.noMatches}
          lowerIsBetter
        />
        <ComparisonMetric
          icon={CheckCircle2}
          label="Ordini verificati"
          comparison={commercial.comparison.conversions}
        />
      </div>
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <div>
          <div className="space-y-4">
            {commercial.funnel.stages.map((stage) => {
              const Icon = stageIcons[stage.stage] || BarChart3;
              return (
                <div key={stage.stage}>
                  <div className="mb-1.5 flex items-center gap-2 text-[11px]">
                    <Icon className="h-3.5 w-3.5 text-brand-500" />
                    <span className="font-semibold text-gray-700">
                      {stageLabels[stage.stage] || stage.stage}
                    </span>
                    <span className="ml-auto font-bold text-gray-900">
                      {stage.conversations}
                    </span>
                    <span className="w-24 text-right text-[9px] text-gray-400">
                      {stage.fromPreviousPercent === null
                        ? "—"
                        : `${stage.fromPreviousPercent}% dallo step`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
                      style={{
                        width: `${stage.conversations ? Math.min(100, Math.max(4, (stage.conversations / max) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[9px] leading-4 text-gray-400">
            Sono conteggiate come vendite solo gli acquisti confermati dal
            negozio e collegati al chatbot. Le visite ai prodotti e i carrelli
            non sono vendite.
          </p>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center gap-2">
              <SearchX className="h-4 w-4 text-amber-500" />
              <p className="text-xs font-semibold text-gray-800">
                Ricerche senza risultati
              </p>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-950">
                  {commercial.noMatch.ratePercent === null
                    ? "—"
                    : `${commercial.noMatch.ratePercent}%`}
                </p>
                <p className="text-[9px] text-gray-400">
                  su {commercial.noMatch.searches} ricerche · più basso è meglio
                </p>
              </div>
              <PointChange
                value={commercial.noMatch.rateChangePoints}
                lowerIsBetter
              />
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-500" />
              <p className="text-xs font-semibold text-gray-800">
                Visitatori e contatti
              </p>
            </div>
            <div className="mt-3 flex justify-between text-[10px]">
              <span className="text-gray-500">Visitatori registrati</span>
              <b>{commercial.leads.total}</b>
            </div>
            <div className="mt-1 flex justify-between text-[10px]">
              <span className="text-gray-500">Attivi nel periodo</span>
              <b>{commercial.leads.activeInPeriod}</b>
            </div>
            <div className="mt-3 space-y-2">
              {commercial.leads.stages.slice(0, 6).map((stage) => (
                <div
                  key={stage.stage}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-2 text-[9px]"
                >
                  <span className="capitalize text-gray-600">
                    {stageLabel(stage.stage)}
                  </span>
                  <b>{stage.contacts}</b>
                </div>
              ))}
              {!commercial.leads.stages.length && (
                <p className="text-[9px] text-gray-400">
                  Nessun contatto ancora registrato.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
function ChannelActionPanel({
  commercial,
}: {
  commercial: Data["commercial"];
}) {
  return (
    <section className="card mt-5 overflow-hidden">
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">
            Performance per canale e azione
          </h2>
        </div>
        <p className="mt-1 text-[10px] leading-4 text-gray-400">
          Gli ordini sono attribuiti al canale soltanto con una conversazione
          verificata. Le azioni misurano esecuzione e affidabilità, non si
          prendono il merito di una vendita senza un legame esplicito.
        </p>
      </div>
      <div className="grid gap-px bg-gray-100 xl:grid-cols-2">
        <div className="min-w-0 bg-white">
          <div className="flex items-center gap-2 px-5 py-4">
            <Radio className="h-4 w-4 text-brand-500" />
            <h3 className="text-xs font-semibold text-gray-800">Canali</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[10px]">
              <thead className="bg-gray-50 uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-5 py-3">Canale</th>
                  <th>Chat</th>
                  <th>Interazioni</th>
                  <th>Lead</th>
                  <th>Ordini</th>
                  <th>Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {commercial.channels.map((row) => (
                  <tr key={row.channel}>
                    <td className="px-5 py-3 font-semibold text-gray-700">
                      {channelLabel(row.channel)}
                    </td>
                    <td>{row.conversations}</td>
                    <td>{row.engagedConversations}</td>
                    <td>{row.leads}</td>
                    <td>{row.conversions}</td>
                    <td>
                      {row.conversionRatePercent === null
                        ? "—"
                        : `${row.conversionRatePercent}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!commercial.channels.length && (
              <Empty text="Nessun canale osservato nel periodo." />
            )}
          </div>
        </div>
        <div className="min-w-0 bg-white">
          <div className="flex items-center gap-2 px-5 py-4">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-semibold text-gray-800">
              Azioni configurate
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-[10px]">
              <thead className="bg-gray-50 uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-5 py-3">Azione</th>
                  <th>Tipo</th>
                  <th>Esecuzioni</th>
                  <th>Successo</th>
                  <th>Latenza</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {commercial.actions.slice(0, 12).map((row) => (
                  <tr key={row.actionId}>
                    <td className="px-5 py-3">
                      <p className="max-w-44 truncate font-semibold text-gray-700">
                        {row.name}
                      </p>
                      <p className="mt-0.5 text-[8px] text-gray-400">
                        {row.conversations} conversazioni · {row.pending} in
                        corso
                      </p>
                    </td>
                    <td className="capitalize">
                      {row.type.replaceAll("_", " ")}
                    </td>
                    <td>{row.executions}</td>
                    <td>
                      {row.successRatePercent === null
                        ? "—"
                        : `${row.successRatePercent}%`}
                    </td>
                    <td>
                      {row.averageLatencyMs === null
                        ? "—"
                        : `${row.averageLatencyMs} ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!commercial.actions.length && (
              <Empty text="Le performance appariranno dopo l’esecuzione delle azioni." />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
function channelLabel(channel: string) {
  const labels: Record<string, string> = {
    widget: "Widget sito",
    chat: "Chat web",
    api: "API",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    public_page: "Pagina pubblica",
    unattributed: "Non attribuito",
    unknown: "Sconosciuto",
  };
  return labels[channel] || channel.replaceAll("_", " ");
}
function ComparisonMetric({
  icon: Icon,
  label,
  comparison,
  lowerIsBetter = false,
}: {
  icon: typeof BarChart3;
  label: string;
  comparison: PeriodComparison;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="bg-white p-4">
      <div className="flex items-center justify-between">
        <Icon className="h-3.5 w-3.5 text-brand-500" />
        <ChangeBadge comparison={comparison} lowerIsBetter={lowerIsBetter} />
      </div>
      <p className="mt-3 text-xl font-bold text-gray-950">
        {comparison.current}
      </p>
      <p className="mt-1 text-[9px] uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-[8px] text-gray-300">
        Prima: {comparison.previous}
      </p>
    </div>
  );
}
function ChangeBadge({
  comparison,
  lowerIsBetter,
}: {
  comparison: PeriodComparison;
  lowerIsBetter: boolean;
}) {
  if (comparison.changePercent === null)
    return <span className="text-[8px] font-medium text-gray-400">nuovo</span>;
  const positive = lowerIsBetter
    ? comparison.changePercent <= 0
    : comparison.changePercent >= 0;
  const Icon = comparison.changePercent >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(comparison.changePercent)}%
    </span>
  );
}
function PointChange({
  value,
  lowerIsBetter,
}: {
  value: number | null;
  lowerIsBetter: boolean;
}) {
  if (value === null)
    return (
      <span className="text-[9px] text-gray-400">
        Confronto non disponibile
      </span>
    );
  const positive = lowerIsBetter ? value <= 0 : value >= 0;
  return (
    <span
      className={`text-[9px] font-semibold ${positive ? "text-emerald-600" : "text-red-600"}`}
    >
      {value > 0 ? "+" : ""}
      {value} punti
    </span>
  );
}
function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    new: "Nuovo",
    qualified: "Qualificato",
    contacted: "Contattato",
    proposal: "Proposta",
    customer: "Cliente",
    client: "Cliente",
    appointment: "Appuntamento",
    lost: "Perso",
  };
  return labels[stage] || stage.replaceAll("_", " ");
}
function analyticsLabel(label: string) {
  const labels: Record<string, string> = {
    product_discovery: "Ricerca prodotti",
    product_search: "Ricerca prodotti",
    variant_availability: "Taglia o variante disponibile",
    question: "Domanda generale",
    conversation: "Conversazione generale",
    returns_policy: "Resi e cambi",
    identity_question: "Informazioni sul negozio",
    order_tracking: "Stato ordine",
    positive: "Positivo",
    neutral: "Neutro",
    negative: "Negativo",
    unknown: "Non definito",
  };
  return labels[label] || label.replaceAll("_", " ");
}
function HelpDeskPanel({ helpdesk }: { helpdesk: Data["helpdesk"] }) {
  return (
    <section className="card mt-5 overflow-hidden">
      <div className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">
          Help Desk · SLA reale
        </h2>
        <p className="mt-1 text-[10px] text-gray-400">
          Prima risposta umana e risoluzione misurate sui cicli tracciati. I
          dati storici senza timestamp sono esclusi.
        </p>
      </div>
      <div className="grid gap-px bg-gray-100 sm:grid-cols-2 xl:grid-cols-6">
        <HelpDeskMetric label="Backlog" value={helpdesk.backlog} />
        <HelpDeskMetric
          label="Prima risposta scaduta"
          value={helpdesk.overdueFirstResponse}
        />
        <HelpDeskMetric
          label="Risoluzione scaduta"
          value={helpdesk.overdueResolution}
        />
        <HelpDeskMetric
          label="SLA prima risposta"
          value={
            helpdesk.firstResponseAttainment === null
              ? "—"
              : `${helpdesk.firstResponseAttainment}%`
          }
        />
        <HelpDeskMetric
          label="SLA risoluzione"
          value={
            helpdesk.resolutionAttainment === null
              ? "—"
              : `${helpdesk.resolutionAttainment}%`
          }
        />
        <HelpDeskMetric
          label="Mediana prima risposta"
          value={durationLabel(helpdesk.firstResponseMedianMs)}
        />
      </div>
    </section>
  );
}
function HelpDeskMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white p-4">
      <p className="text-[9px] uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
function durationLabel(value: number | null) {
  if (value === null) return "—";
  const minutes = Math.round(value / 60000);
  return minutes < 60
    ? `${minutes} min`
    : `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)} h`;
}
function PipelinePanel({ pipeline }: { pipeline: Data["pipeline"] }) {
  const labels: Record<string, string> = {
    crawl: "Crawl",
    cleaning: "Pulizia",
    embedding: "Embedding",
    retrieval: "Retrieval",
    reranking: "Reranking",
    generation: "Generazione",
    web_search: "Ricerca web",
  };
  return (
    <section className="card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Pipeline RAG · latenza e costo
          </h2>
          <p className="mt-1 text-[10px] text-gray-400">
            Misure reali per ogni fase, non stime aggregate della richiesta.
          </p>
        </div>
        <div className="flex gap-2 text-[10px]">
          <span className="rounded-lg bg-brand-50 px-2.5 py-1.5 font-semibold text-brand-700">
            ${pipeline.aiCostUsd.toFixed(4)}
          </span>
          <span className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-gray-600">
            {pipeline.aiTokens.toLocaleString("it-IT")} token
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="bg-gray-50 text-[9px] uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-5 py-3">Fase</th>
              <th>Chiamate</th>
              <th>Latenza media</th>
              <th>Successo</th>
              <th>Token</th>
              <th>Costo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pipeline.stages.map((stage) => (
              <tr key={stage.stage}>
                <td className="px-5 py-3 font-semibold text-gray-700">
                  {labels[stage.stage] || stage.stage}
                </td>
                <td>{stage.calls}</td>
                <td>{stage.averageLatencyMs} ms</td>
                <td>{stage.successRate}%</td>
                <td>{stage.totalTokens.toLocaleString("it-IT")}</td>
                <td>${stage.totalCostUsd.toFixed(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pipeline.stages.length && (
          <Empty text="Le metriche appariranno dopo i prossimi crawl e conversazioni." />
        )}
      </div>
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="px-5 py-10 text-center text-xs text-gray-400">{text}</p>;
}
