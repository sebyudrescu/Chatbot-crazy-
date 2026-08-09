"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  Database,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Settings2,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  UserRoundCheck,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SafeRichText } from "@/components/chat/SafeRichText";
import {
  OrderLookupForm,
  OrderStatusCardView,
} from "@/components/chat/OrderTracking";
import { ProductCarousel } from "@/components/chat/ProductCarousel";
import { ActionCards } from "@/components/chat/ActionCards";
import {
  getLeadWidgetSession,
  LeadCaptureForm,
  type LeadFormDefinition,
} from "@/components/chat/LeadCaptureForm";
import type { OrderStatusCard, ProductCard } from "@/lib/commerce-types";
import {
  buildInitialQuickReplies,
  detectBusinessMode,
} from "@/lib/conversation-guidance";

interface QuickReply {
  id: string;
  text: string;
  action?: string;
  payload?: Record<string, string>;
}
interface CTA {
  id: string;
  label: string;
  action: string;
  type: string;
  metadata?: { title?: unknown; description?: unknown };
}
interface ProductWidgetPresentation {
  title: string;
  description: string;
  label: string;
}
interface Source {
  id: string;
  sourceType: string;
  sourceUrl?: string;
  originalFilename?: string;
}
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  quickReplies?: QuickReply[];
  ctas?: CTA[];
  sources?: Source[];
  productCards?: ProductCard[];
  productWidget?: ProductWidgetPresentation | null;
  leadForms?: LeadFormDefinition[];
  orderLookupForm?: boolean;
  orderStatusCard?: OrderStatusCard;
  error?: boolean;
}
interface BotData {
  id: string;
  companyName: string;
  kbStatus: string;
  kbTotalChunks: number;
  systemPrompt?: string;
  promptTemplateId?: string;
  settings?: {
    welcomeMessage?: string;
    fallbackMessage?: string;
    role?: string;
    objective?: string;
  };
}
interface Diagnostics {
  intent: string;
  strategy: string;
  confidence: number;
  processingTime: number;
  chunks: number;
  facts: number;
  coherent: boolean;
}

function welcomeMessage(bot: BotData): Message {
  const mode = detectBusinessMode(
    [
      bot.companyName,
      bot.systemPrompt,
      bot.promptTemplateId,
      bot.settings?.role,
      bot.settings?.objective,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return {
    id: "welcome",
    role: "assistant",
    content:
      bot.settings?.welcomeMessage ||
      `Ciao! Sono l'assistente di ${bot.companyName}. Come posso aiutarti?`,
    createdAt: new Date().toISOString(),
    quickReplies: buildInitialQuickReplies(mode),
  };
}

export default function ChatPage() {
  const { botId } = useParams<{ botId: string }>();
  const [bot, setBot] = useState<BotData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [userSessionId, setUserSessionId] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(
    (data?: BotData) => {
      const current = data || bot;
      setConversationId(null);
      setDiagnostics(null);
      setInput("");
      setMessages(current ? [welcomeMessage(current)] : []);
    },
    [bot],
  );

  useEffect(() => {
    setUserSessionId(`preview_${crypto.randomUUID()}`);
  }, []);
  useEffect(() => {
    fetch(`/api/chatbots/${botId}`)
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          const data = result.data as BotData;
          setBot(data);
          setMessages([welcomeMessage(data)]);
        }
      })
      .finally(() => setLoading(false));
  }, [botId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text?: string, privateEntry = false) => {
    const content = (text || input).trim();
    if (!content || sending || !bot) return;
    setMessages((current) => [
      ...current,
      {
        id: `u-${Date.now()}`,
        role: "user",
        content: privateEntry
          ? "[Dati ordine inviati in modo protetto]"
          : content,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");
    setSending(true);
    try {
      let activeSessionId = userSessionId || `preview_${Date.now()}`;
      try {
        activeSessionId = (await getLeadWidgetSession(botId)).sessionId;
      } catch {
        // The private chat preview remains available before the agent is published.
      }
      setUserSessionId(activeSessionId);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId,
          message: content,
          conversationId,
          userSessionId: activeSessionId,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const knowledge = result.error === "knowledge_base_not_ready";
        setMessages((current) => [
          ...current,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            error: true,
            content: knowledge
              ? `${result.message || "Knowledge base non pronta"} ${result.suggestion || ""}`
              : result.error || "Risposta non disponibile",
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }
      const data = result.data;
      setConversationId(data.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: data.assistantMessage.id,
          role: "assistant",
          content: data.assistantMessage.content,
          createdAt: data.assistantMessage.createdAt,
          quickReplies: data.quickReplies || [],
          ctas: data.ctas || [],
          sources: data.sources || [],
          productCards: data.productCards || [],
          productWidget: data.productWidget || null,
          leadForms: data.actions?.leadForms || [],
          orderLookupForm: Boolean(data.orderLookupForm),
          orderStatusCard: data.orderStatusCard,
        },
      ]);
      setDiagnostics({
        intent: data.intent?.type || "—",
        strategy: data.decision?.strategy || "—",
        confidence: data.confidence?.score || 0,
        processingTime: data.processingTimeMs || 0,
        chunks: data.memory?.knowledgeChunksUsed || 0,
        facts: data.memory?.factsExtracted || 0,
        coherent: data.confidence?.isCoherent ?? true,
      });
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          error: true,
          content: "Il servizio non è raggiungibile. Riprova tra poco.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const feedback = async (
    messageId: string,
    value: "positive" | "negative",
  ) => {
    await fetch(`/api/messages/${messageId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: value }),
    });
  };
  const escalate = async () => {
    if (!conversationId) return;
    setEscalating(true);
    try {
      await fetch(`/api/conversations/${conversationId}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Richiesta dalla chat di prova" }),
      });
    } finally {
      setEscalating(false);
    }
  };
  if (loading)
    return (
      <DashboardLayout>
        <LoadingSpinner fullPage text="Apertura chat di prova..." />
      </DashboardLayout>
    );
  if (!bot)
    return (
      <DashboardLayout>
        <div className="p-8 text-sm text-red-600">Agente non trovato.</div>
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1450px] p-5 lg:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Agent preview</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-950">
              Testa {bot.companyName}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Conversazione reale con prompt, fonti e memoria attualmente
              pubblicati.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/chatbot/${botId}/settings`}
              className="btn btn-secondary btn-sm"
            >
              <Settings2 className="h-4 w-4" />
              Configura
            </Link>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => reset()}
              icon={<RotateCcw className="h-4 w-4" />}
            >
              Nuova sessione
            </Button>
          </div>
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <section className="card flex h-[720px] flex-col overflow-hidden">
            <div className="flex items-center justify-between bg-gradient-to-r from-brand-700 to-brand-500 px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{bot.companyName}</p>
                  <p className="flex items-center gap-1 text-[10px] text-white/75">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    Online
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px]">
                Preview privata
              </span>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[78%]">
                    <div
                      className={`rounded-2xl px-4 py-3 text-xs leading-5 shadow-sm ${message.role === "user" ? "rounded-br-sm bg-brand-600 text-white" : message.error ? "rounded-bl-sm border border-red-100 bg-red-50 text-red-700" : "rounded-bl-sm border bg-white text-gray-700"}`}
                    >
                      {message.role === "assistant" && !message.error ? (
                        <SafeRichText content={message.content} />
                      ) : (
                        message.content
                      )}
                    </div>
                    <ProductCarousel
                      cards={message.productCards}
                      presentation={message.productWidget ?? undefined}
                    />
                    {message.role === "assistant"
                      ? message.leadForms?.map((definition) => (
                          <LeadCaptureForm
                            key={definition.id}
                            botId={botId}
                            conversationId={conversationId}
                            userSessionId={userSessionId}
                            definition={definition}
                          />
                        ))
                      : null}
                    {message.role === "assistant" && message.orderLookupForm ? (
                      <OrderLookupForm
                        busy={sending}
                        onLookup={(orderNumber, email) =>
                          send(`Ordine ${orderNumber}, ${email}`, true)
                        }
                      />
                    ) : null}
                    {message.role === "assistant" ? (
                      <OrderStatusCardView card={message.orderStatusCard} />
                    ) : null}
                    {message.role === "assistant" &&
                      !message.error &&
                      message.id !== "welcome" && (
                        <div className="mt-1 flex items-center gap-2 px-1">
                          <button
                            onClick={() => feedback(message.id, "positive")}
                            className="text-gray-300 hover:text-emerald-600"
                            aria-label="Risposta utile"
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => feedback(message.id, "negative")}
                            className="text-gray-300 hover:text-red-500"
                            aria-label="Risposta non utile"
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </button>
                          {message.sources?.length ? (
                            <span className="text-[9px] text-gray-400">
                              {message.sources.length} fonti usate
                            </span>
                          ) : null}
                        </div>
                      )}
                    {message.quickReplies?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.quickReplies.slice(0, 4).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => send(item.text)}
                            className="rounded-lg border bg-white px-3 py-1.5 text-[10px] font-medium text-brand-700 hover:bg-brand-50"
                          >
                            {item.text}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <ActionCards actions={message.ctas} />
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                  Sto preparando la risposta...
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="border-t bg-white p-4">
              <div className="flex items-end gap-2">
                <textarea
                  aria-label="Messaggio"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                  className="textarea resize-none text-xs"
                  placeholder="Scrivi un messaggio..."
                />
                <Button
                  disabled={!input.trim() || sending}
                  onClick={() => send()}
                  icon={<Send className="h-4 w-4" />}
                />
              </div>
            </div>
          </section>
          <aside className="space-y-4">
            <div className="card p-4">
              <h2 className="text-xs font-semibold text-gray-900">
                Stato agente
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Metric
                  label="Knowledge"
                  value={bot.kbStatus === "ready" ? "Pronta" : bot.kbStatus}
                />
                <Metric label="Chunks" value={String(bot.kbTotalChunks)} />
                <Metric
                  label="Sessione"
                  value={conversationId ? "Attiva" : "Nuova"}
                />
                <Metric label="Messaggi" value={String(messages.length)} />
              </div>
            </div>
            <div className="card p-4">
              <h2 className="text-xs font-semibold text-gray-900">
                Diagnostica ultima risposta
              </h2>
              {diagnostics ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Metric
                      label="Confidenza"
                      value={`${Math.round(diagnostics.confidence * 100)}%`}
                    />
                    <Metric
                      label="Tempo"
                      value={`${diagnostics.processingTime} ms`}
                    />
                    <Metric label="Intento" value={diagnostics.intent} />
                    <Metric label="Strategia" value={diagnostics.strategy} />
                    <Metric
                      label="Chunks usati"
                      value={String(diagnostics.chunks)}
                    />
                    <Metric
                      label="Fatti estratti"
                      value={String(diagnostics.facts)}
                    />
                  </div>
                  <div
                    className={`mt-3 flex items-center gap-2 rounded-lg p-3 text-[10px] ${diagnostics.coherent ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                  >
                    {diagnostics.coherent ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <ShieldAlert className="h-4 w-4" />
                    )}
                    {diagnostics.coherent
                      ? "Risposta coerente"
                      : "Controllo consigliato"}
                  </div>
                </>
              ) : (
                <p className="mt-3 rounded-lg bg-gray-50 p-4 text-[10px] leading-5 text-gray-400">
                  Invia un messaggio per vedere la decisione del motore.
                </p>
              )}
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2">
                <UserRoundCheck className="h-4 w-4 text-brand-600" />
                <h2 className="text-xs font-semibold text-gray-900">
                  Human handoff
                </h2>
              </div>
              <p className="mt-2 text-[10px] leading-5 text-gray-500">
                Simula il passaggio della conversazione all’inbox operativa.
              </p>
              <Button
                className="mt-3"
                fullWidth
                size="sm"
                variant="secondary"
                disabled={!conversationId || escalating}
                loading={escalating}
                onClick={escalate}
              >
                Invia all’operatore
              </Button>
            </div>
            <Link
              href={`/chatbot/${botId}/knowledge`}
              className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4 text-brand-700"
            >
              <Database className="h-4 w-4" />
              <div>
                <p className="text-xs font-semibold">Gestisci fonti</p>
                <p className="text-[9px]">Aggiorna la knowledge base</p>
              </div>
            </Link>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <p className="text-[9px] uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p
        className="mt-1 truncate text-[11px] font-semibold text-gray-800"
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
