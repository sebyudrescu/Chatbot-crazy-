"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Archive,
  Bot,
  Check,
  Clock3,
  Download,
  Info,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  PencilLine,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Tag as TagIcon,
  User,
  UserRoundCheck,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SafeRichText } from "@/components/chat/SafeRichText";
import { whatsappServiceWindow } from "@/lib/meta-payloads";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  feedback?: string | null;
  channel?: string;
  deliveryStatus?: string | null;
  responseRevisions?: ResponseRevision[];
}
interface ResponseRevision {
  id: string;
  version: number;
  question: string;
  originalAnswer: string;
  revisedAnswer: string;
  rationale: string | null;
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  status: "draft" | "publishing" | "published" | "failed" | "archiving" | "archived";
  publishedAt: string | null;
  archivedAt: string | null;
}
interface WhatsAppTemplate {
  id?: string;
  name: string;
  language: string;
  category: string;
  body: string;
  parameterCount: number;
  supported: boolean;
}
interface Conversation {
  id: string;
  botId: string;
  userSessionId: string;
  startedAt: string;
  lastMessageAt: string | null;
  userIntent: string | null;
  sentiment: string | null;
  channel: string;
  externalThreadId?: string | null;
  isResolved: boolean;
  userName: string | null;
  userEmail: string | null;
  userPhone?: string | null;
  userCompany?: string | null;
  needsHumanEscalation: boolean;
  escalationReason: string | null;
  assignedAgent?: string | null;
  summary?: string | null;
  internalNotes?: string | null;
  tags: string[];
  chatbot: { id: string; companyName: string };
  messages: Message[];
  _count: { messages: number };
}
type Status = "all" | "open" | "escalated" | "resolved";

export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [bot, setBot] = useState("all");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [aiBusy, setAiBusy] = useState<"summary" | "reply" | null>(null);
  const [aiError, setAiError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [revisionTarget, setRevisionTarget] = useState<Message | null>(null);
  const [revisionQuestion, setRevisionQuestion] = useState("");
  const [revisionAnswer, setRevisionAnswer] = useState("");
  const [revisionRationale, setRevisionRationale] = useState("");
  const [revisionExpected, setRevisionExpected] = useState("");
  const [revisionForbidden, setRevisionForbidden] = useState("");
  const [revisionDraftId, setRevisionDraftId] = useState<string | null>(null);
  const [revisionReview, setRevisionReview] = useState(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [revisionError, setRevisionError] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateKey, setTemplateKey] = useState("");
  const [templateParameters, setTemplateParameters] = useState<string[]>([]);
  const [mobilePanel, setMobilePanel] = useState<
    "list" | "conversation" | "details"
  >("list");
  const selectedRef = useRef<Conversation | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const openConversation = useCallback(
    async (conversation: Conversation, showOnMobile = true) => {
      setSelected(conversation);
      setNoteDraft(conversation.internalNotes || "");
      setReplyError("");
      setDetailLoading(true);
      if (showOnMobile) setMobilePanel("conversation");
      try {
        const response = await fetch(`/api/conversations/${conversation.id}`);
        const result = await response.json();
        if (result.success) {
          const full = {
            ...result.data,
            _count: conversation._count,
          } as Conversation;
          setSelected(full);
          setNoteDraft(full.internalNotes || "");
          setItems((current) =>
            current.map((item) =>
              item.id === full.id ? { ...item, ...full } : item,
            ),
          );
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      const result = await response.json();
      const conversations = result.success ? result.data : [];
      setItems(conversations);
      if (conversations[0] && !selectedRef.current) {
        const requestedId =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("conversation")
            : null;
        await openConversation(
          conversations.find((item: Conversation) => item.id === requestedId) ||
            conversations[0],
          Boolean(requestedId),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [openConversation]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;
    let running = false;
    const refresh = async () => {
      if (!active || running || document.hidden) return;
      running = true;
      try {
        const current = selectedRef.current;
        const [listResult, detailResult] = await Promise.all([
          fetch("/api/conversations", { cache: "no-store" }).then((response) => response.json()),
          current
            ? fetch(`/api/conversations/${current.id}`, { cache: "no-store" }).then((response) => response.json())
            : Promise.resolve(null),
        ]);
        if (!active) return;
        if (listResult.success) setItems(listResult.data);
        if (detailResult?.success) {
          setSelected((selectedConversation) =>
            selectedConversation && selectedConversation.id === detailResult.data.id
              ? { ...detailResult.data, _count: selectedConversation._count }
              : selectedConversation,
          );
        }
      } finally {
        running = false;
      }
    };
    const interval = window.setInterval(() => void refresh(), 8_000);
    const onVisibilityChange = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const bots = useMemo(
    () =>
      Array.from(
        new Map(items.map((item) => [item.chatbot.id, item.chatbot])).values(),
      ),
    [items],
  );
  const lastInboundAt = useMemo(
    () =>
      selected?.messages.filter((message) => message.role === "user").at(-1)
        ?.createdAt,
    [selected?.messages],
  );
  const whatsappWindow =
    selected?.channel === "whatsapp"
      ? whatsappServiceWindow(lastInboundAt)
      : null;
  const whatsappWindowOpen = whatsappWindow?.open;
  useEffect(() => {
    if (
      !selected?.id ||
      selected.channel !== "whatsapp" ||
      whatsappWindowOpen
    ) {
      setTemplates([]);
      setTemplateKey("");
      setTemplateParameters([]);
      return;
    }
    let active = true;
    setTemplatesLoading(true);
    setReplyError("");
    fetch(
      `/api/meta/whatsapp/templates?botId=${encodeURIComponent(selected.botId)}`,
    )
      .then((response) =>
        response.json().then((result) => ({ response, result })),
      )
      .then(({ response, result }) => {
        if (!active) return;
        if (!response.ok)
          throw new Error(result.error || "Lettura template non riuscita");
        setTemplates(result.data || []);
      })
      .catch(
        (error) =>
          active &&
          setReplyError(
            error instanceof Error
              ? error.message
              : "Lettura template non riuscita",
          ),
      )
      .finally(() => active && setTemplatesLoading(false));
    return () => {
      active = false;
    };
  }, [selected?.botId, selected?.channel, selected?.id, whatsappWindowOpen]);
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const query = search.toLowerCase().trim();
        const matchSearch =
          !query ||
          [
            item.userName,
            item.userEmail,
            item.userPhone,
            item.userSessionId,
            item.messages?.[0]?.content,
          ].some((value) => value?.toLowerCase().includes(query));
        const matchBot = bot === "all" || item.botId === bot;
        const matchStatus =
          status === "all" ||
          (status === "open" && !item.isResolved) ||
          (status === "resolved" && item.isResolved) ||
          (status === "escalated" && item.needsHumanEscalation);
        return matchSearch && matchBot && matchStatus;
      }),
    [items, search, bot, status],
  );

  const patchSelected = async (data: Partial<Conversation>) => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const updated = { ...selected, ...result.data };
      setSelected(updated);
      setItems((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setReplyError("");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selected.id,
          role: "assistant",
          content: reply.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSelected((current) =>
        current
          ? {
              ...current,
              messages: [...current.messages, result.data],
              lastMessageAt: result.data.createdAt,
            }
          : current,
      );
      setReply("");
    } catch (error) {
      setReplyError(
        error instanceof Error ? error.message : "Invio non riuscito",
      );
    } finally {
      setBusy(false);
    }
  };

  const selectedTemplate = templates.find(
    (template) => `${template.name}:${template.language}` === templateKey,
  );
  const chooseTemplate = (key: string) => {
    setTemplateKey(key);
    const template = templates.find(
      (item) => `${item.name}:${item.language}` === key,
    );
    setTemplateParameters(
      Array.from({ length: template?.parameterCount || 0 }, () => ""),
    );
    setReplyError("");
  };
  const sendTemplate = async () => {
    if (
      !selected ||
      !selectedTemplate ||
      templateParameters.some((value) => !value.trim())
    )
      return;
    setBusy(true);
    setReplyError("");
    try {
      const response = await fetch("/api/meta/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selected.id,
          templateName: selectedTemplate.name,
          language: selectedTemplate.language,
          parameters: templateParameters,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Invio template non riuscito");
      setSelected((current) =>
        current
          ? {
              ...current,
              messages: [...current.messages, result.data],
              lastMessageAt: result.data.createdAt,
            }
          : current,
      );
      setTemplateKey("");
      setTemplateParameters([]);
    } catch (error) {
      setReplyError(
        error instanceof Error ? error.message : "Invio template non riuscito",
      );
    } finally {
      setBusy(false);
    }
  };

  const assist = async (mode: "summary" | "reply") => {
    if (!selected) return;
    setAiBusy(mode);
    setAiError("");
    try {
      const response = await fetch(`/api/conversations/${selected.id}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Assistenza AI non riuscita");
      if (mode === "reply") setReply(result.data.suggestedReply);
      else
        await patchSelected({
          summary: result.data.summary,
          tags: [...new Set([...(selected.tags || []), ...result.data.tags])],
        });
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "Assistenza AI non riuscita",
      );
    } finally {
      setAiBusy(null);
    }
  };

  const addTag = async () => {
    if (!selected || !tagDraft.trim()) return;
    await patchSelected({
      tags: [
        ...new Set([...(selected.tags || []), tagDraft.trim().toLowerCase()]),
      ],
    });
    setTagDraft("");
  };

  const removeTag = (tag: string) =>
    selected &&
    patchSelected({ tags: selected.tags.filter((item) => item !== tag) });

  const openRevision = (message: Message) => {
    if (!selected) return;
    const messageIndex = selected.messages.findIndex((item) => item.id === message.id);
    const precedingQuestion = selected.messages
      .slice(0, messageIndex)
      .reverse()
      .find((item) => item.role === "user")?.content || "";
    const editable = message.responseRevisions?.find((item) =>
      ["draft", "failed"].includes(item.status),
    );
    setRevisionTarget(message);
    setRevisionQuestion(editable?.question || precedingQuestion);
    setRevisionAnswer(editable?.revisedAnswer || message.content);
    setRevisionRationale(editable?.rationale || "");
    setRevisionExpected(editable?.expectedKeywords.join(", ") || "");
    setRevisionForbidden(editable?.forbiddenKeywords.join(", ") || "");
    setRevisionDraftId(editable?.id || null);
    setRevisionReview(false);
    setRevisionError("");
  };

  const revisionPayload = () => ({
    question: revisionQuestion.trim(),
    revisedAnswer: revisionAnswer.trim(),
    rationale: revisionRationale.trim() || null,
    expectedKeywords: revisionExpected.split(",").map((item) => item.trim()).filter(Boolean),
    forbiddenKeywords: revisionForbidden.split(",").map((item) => item.trim()).filter(Boolean),
  });

  const saveRevisionDraft = async () => {
    if (!revisionTarget) return null;
    setRevisionBusy(true);
    setRevisionError("");
    try {
      const response = await fetch(
        revisionDraftId
          ? `/api/response-revisions/${revisionDraftId}`
          : `/api/messages/${revisionTarget.id}/revisions`,
        {
          method: revisionDraftId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(revisionPayload()),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Salvataggio bozza non riuscito");
      setRevisionDraftId(result.data.id);
      setRevisionExpected(result.data.expectedKeywords.join(", "));
      setRevisionForbidden(result.data.forbiddenKeywords.join(", "));
      setRevisionReview(true);
      return result.data as ResponseRevision;
    } catch (error) {
      setRevisionError(error instanceof Error ? error.message : "Salvataggio bozza non riuscito");
      return null;
    } finally {
      setRevisionBusy(false);
    }
  };

  const publishRevision = async () => {
    if (!revisionDraftId || !selected) return;
    setRevisionBusy(true);
    setRevisionError("");
    try {
      const response = await fetch(`/api/response-revisions/${revisionDraftId}/publish`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pubblicazione non riuscita");
      const current = selected;
      setRevisionTarget(null);
      await openConversation(current, false);
    } catch (error) {
      setRevisionError(error instanceof Error ? error.message : "Pubblicazione non riuscita");
    } finally {
      setRevisionBusy(false);
    }
  };

  const archiveRevision = async (revision: ResponseRevision) => {
    if (!selected || !window.confirm("Rimuovere questa Q&A verificata dalla knowledge base e disattivare il relativo test?")) return;
    setRevisionBusy(true);
    setRevisionError("");
    try {
      const response = await fetch(`/api/response-revisions/${revision.id}/archive`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Archiviazione non riuscita");
      const current = selected;
      setRevisionTarget(null);
      await openConversation(current, false);
    } catch (error) {
      setRevisionError(error instanceof Error ? error.message : "Archiviazione non riuscita");
    } finally {
      setRevisionBusy(false);
    }
  };

  if (loading)
    return (
      <DashboardLayout>
        <LoadingSpinner fullPage text="Caricamento inbox..." />
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100dvh-4rem)] min-h-0 overflow-hidden lg:min-h-[700px]">
        <aside
          aria-label="Elenco conversazioni"
          className={`${mobilePanel === "list" ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-gray-200 bg-white lg:flex lg:w-[350px]`}
        >
          <div className="border-b p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Inbox operativa</p>
                <h1 className="mt-1 text-xl font-bold text-gray-950">
                  Chat Logs
                </h1>
              </div>
              <div className="flex gap-1">
                <a
                  href={`/api/conversations/export?botId=${encodeURIComponent(bot)}&status=${encodeURIComponent(status)}`}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                  aria-label="Esporta conversazioni CSV"
                  title="Esporta CSV"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={load}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                  aria-label="Aggiorna"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cerca conversazioni..."
                className="input pl-9 text-xs"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={bot}
                onChange={(event) => setBot(event.target.value)}
                className="input py-2 text-xs"
              >
                <option value="all">Tutti gli agenti</option>
                {bots.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.companyName}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as Status)}
                className="input py-2 text-xs"
              >
                <option value="all">Tutti gli stati</option>
                <option value="open">Aperte</option>
                <option value="escalated">Handoff</option>
                <option value="resolved">Risolte</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => openConversation(item)}
                className={`w-full border-b border-gray-100 p-4 text-left transition hover:bg-gray-50 ${selected?.id === item.id ? "bg-brand-50/70" : ""}`}
              >
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-gray-900">
                        {displayName(item)}
                      </p>
                      <span className="shrink-0 text-[9px] text-gray-400">
                        {relativeDate(item.lastMessageAt || item.startedAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-gray-400">
                      {item.chatbot.companyName} · {item._count.messages}{" "}
                      messaggi
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      {item.needsHumanEscalation && (
                        <Tag color="red">Handoff</Tag>
                      )}
                      {item.isResolved ? (
                        <Tag color="green">Risolta</Tag>
                      ) : (
                        <Tag color="gray">Aperta</Tag>
                      )}
                      {item.userIntent && (
                        <Tag color="brand">{item.userIntent}</Tag>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {!filtered.length && (
              <div className="p-8 text-center text-xs text-gray-400">
                Nessuna conversazione trovata.
              </div>
            )}
          </div>
        </aside>

        <main
          className={`${mobilePanel === "conversation" ? "flex" : "hidden"} min-w-0 flex-1 flex-col bg-gray-50/70 lg:flex`}
        >
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b bg-white px-3 py-3 sm:px-6 sm:py-4">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setMobilePanel("list")}
                    aria-label="Torna alle conversazioni"
                    className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 lg:hidden"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 sm:flex">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-gray-950">
                      {displayName(selected)}
                    </h2>
                    <p className="truncate text-[10px] text-gray-400">
                      {selected.chatbot.companyName} ·{" "}
                      {channelLabel(selected.channel)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMobilePanel("details")}
                    aria-label="Apri dettagli conversazione"
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 xl:hidden"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  {selected.needsHumanEscalation ? (
                    <Button
                      aria-label="Restituisci la conversazione al chatbot"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        patchSelected({ needsHumanEscalation: false })
                      }
                    >
                      <span className="hidden sm:inline">Ritorna al bot</span>
                      <span className="sm:hidden">Bot</span>
                    </Button>
                  ) : (
                    <Button
                      aria-label="Prendi in carico la conversazione"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        patchSelected({
                          needsHumanEscalation: true,
                          escalationReason: "Presa in carico manuale",
                        })
                      }
                      icon={<UserRoundCheck className="h-4 w-4" />}
                    >
                      <span className="hidden sm:inline">Prendi in carico</span>
                    </Button>
                  )}
                  <Button
                    aria-label={
                      selected.isResolved
                        ? "Riapri la conversazione"
                        : "Risolvi la conversazione"
                    }
                    size="sm"
                    variant={selected.isResolved ? "secondary" : "success"}
                    disabled={busy}
                    onClick={() =>
                      patchSelected({ isResolved: !selected.isResolved })
                    }
                    icon={<Check className="h-4 w-4" />}
                  >
                    <span className="hidden sm:inline">
                      {selected.isResolved ? "Riapri" : "Risolvi"}
                    </span>
                  </Button>
                </div>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-6">
                {detailLoading ? (
                  <LoadingSpinner text="Caricamento messaggi..." />
                ) : (
                  selected.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-5 shadow-sm sm:max-w-[72%] ${message.role === "user" ? "rounded-bl-sm border bg-white text-gray-700" : "rounded-br-sm bg-brand-600 text-white"}`}
                      >
                        {message.role === "assistant" ? (
                          <SafeRichText content={message.content} />
                        ) : (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        )}
                        <p className="mt-1 text-[9px] opacity-60">
                          {new Date(message.createdAt).toLocaleTimeString(
                            "it-IT",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                          {message.feedback
                            ? ` · feedback ${message.feedback}`
                            : ""}
                          {message.deliveryStatus
                            ? ` · ${deliveryLabel(message.deliveryStatus)}`
                            : ""}
                        </p>
                        {message.role === "assistant" && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/20 pt-2">
                            <button
                              type="button"
                              onClick={() => openRevision(message)}
                              className="flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-[9px] font-semibold text-white hover:bg-white/25"
                            >
                              <PencilLine className="h-3 w-3" />
                              Correggi e insegna
                            </button>
                            {message.responseRevisions?.slice(0, 2).map((revision) => (
                              <span
                                key={revision.id}
                                className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${revision.status === "published" ? "bg-emerald-100 text-emerald-800" : revision.status === "archived" ? "bg-gray-200 text-gray-600" : "bg-amber-100 text-amber-800"}`}
                              >
                                v{revision.version} · {revision.status === "published" ? "verificata" : revision.status === "archived" ? "archiviata" : "bozza"}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t bg-white p-3 sm:p-4">
                {selected.channel === "whatsapp" && (
                  <div
                    className={`mx-auto mb-3 max-w-3xl rounded-lg border px-3 py-2 text-[10px] leading-4 ${whatsappWindowOpen ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-semibold">
                        {whatsappWindowOpen
                          ? `Finestra WhatsApp aperta${whatsappWindow?.closesAt ? ` fino alle ${new Date(whatsappWindow.closesAt).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : ""}`
                          : "Finestra WhatsApp chiusa: usa un template approvato da Meta."}
                      </span>
                    </div>
                  </div>
                )}
                {selected.channel === "whatsapp" && !whatsappWindowOpen ? (
                  <div className="mx-auto max-w-3xl space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-800">
                        Template WhatsApp
                      </p>
                      {templatesLoading && (
                        <LoadingSpinner text="Caricamento template..." />
                      )}
                    </div>
                    {!templatesLoading && (
                      <select
                        aria-label="Template WhatsApp"
                        className="input text-xs"
                        value={templateKey}
                        onChange={(event) => chooseTemplate(event.target.value)}
                      >
                        <option value="">
                          Seleziona un template approvato
                        </option>
                        {templates.map((template) => (
                          <option
                            key={`${template.name}:${template.language}`}
                            value={`${template.name}:${template.language}`}
                            disabled={!template.supported}
                          >
                            {template.name} · {template.language} ·{" "}
                            {template.category}
                            {template.supported
                              ? ""
                              : " · variabili non supportate"}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedTemplate && (
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="whitespace-pre-wrap text-[11px] leading-5 text-gray-600">
                          {selectedTemplate.body}
                        </p>
                        {templateParameters.map((value, index) => (
                          <label key={index} className="mt-2 block">
                            <span className="label">Valore {index + 1}</span>
                            <input
                              className="input text-xs"
                              value={value}
                              onChange={(event) =>
                                setTemplateParameters((current) =>
                                  current.map((item, parameterIndex) =>
                                    parameterIndex === index
                                      ? event.target.value
                                      : item,
                                  ),
                                )
                              }
                              placeholder={`Sostituisce {{${index + 1}}}`}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button
                        disabled={
                          busy ||
                          !selectedTemplate ||
                          templateParameters.some((value) => !value.trim())
                        }
                        onClick={sendTemplate}
                        icon={<Send className="h-4 w-4" />}
                      >
                        Invia template
                      </Button>
                    </div>
                    {!templatesLoading && !templates.length && (
                      <p className="rounded-lg bg-gray-50 p-3 text-[10px] text-gray-500">
                        Nessun template Utility o Authentication approvato
                        disponibile nel WhatsApp Business Account.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={Boolean(aiBusy) || detailLoading}
                        onClick={() => assist("reply")}
                        icon={
                          <Sparkles
                            className={`h-3.5 w-3.5 ${aiBusy === "reply" ? "animate-pulse" : ""}`}
                          />
                        }
                      >
                        {aiBusy === "reply"
                          ? "Creo la bozza..."
                          : "Suggerisci risposta AI"}
                      </Button>
                      {aiError && (
                        <p className="text-[9px] text-red-600">{aiError}</p>
                      )}
                    </div>
                    <div className="mx-auto flex max-w-3xl items-end gap-2">
                      <textarea
                        aria-label="Risposta operatore"
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            sendReply();
                          }
                        }}
                        rows={2}
                        className="textarea resize-none text-xs"
                        placeholder="Rispondi come operatore..."
                      />
                      <Button
                        aria-label="Invia risposta"
                        disabled={busy || !reply.trim()}
                        onClick={sendReply}
                        icon={<Send className="h-4 w-4" />}
                      />
                    </div>
                    <p className="mx-auto mt-1 max-w-3xl text-[9px] text-gray-400">
                      La bozza AI non viene inviata automaticamente: puoi
                      modificarla prima dell’invio.
                    </p>
                  </>
                )}
                {replyError && (
                  <p
                    role="alert"
                    className="mx-auto mt-3 max-w-3xl rounded-lg bg-red-50 p-2 text-[10px] text-red-700"
                  >
                    {replyError}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center">
              <MessageSquare className="h-8 w-8 text-brand-500" />
              <p className="mt-3 text-sm font-semibold">
                Seleziona una conversazione
              </p>
            </div>
          )}
        </main>

        <aside
          aria-label="Dettagli conversazione"
          className={`${mobilePanel === "details" ? "fixed inset-x-0 bottom-0 top-16 z-40 block" : "hidden"} w-full shrink-0 overflow-y-auto border-l bg-white p-5 xl:static xl:block xl:w-[310px]`}
        >
          {selected && (
            <>
              <div className="mb-4 flex items-center justify-between xl:hidden">
                <button
                  type="button"
                  onClick={() => setMobilePanel("conversation")}
                  className="flex items-center gap-1 rounded-lg p-2 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Conversazione
                </button>
                <p className="text-xs font-semibold text-gray-900">Dettagli</p>
              </div>
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-900">
                  Dettagli contatto
                </h2>
                <button
                  onClick={() => setEditing(!editing)}
                  className="text-[10px] font-semibold text-brand-600"
                >
                  {editing ? "Chiudi" : "Modifica"}
                </button>
              </div>
              {editing ? (
                <ContactEditor
                  conversation={selected}
                  onSave={async (data) => {
                    await patchSelected(data);
                    setEditing(false);
                  }}
                />
              ) : (
                <div className="mt-4 space-y-3">
                  <InfoRow
                    icon={User}
                    label="Nome"
                    value={selected.userName || "Non disponibile"}
                  />
                  <InfoRow
                    icon={Mail}
                    label="Email"
                    value={selected.userEmail || "Non disponibile"}
                  />
                  <InfoRow
                    icon={Phone}
                    label="Telefono"
                    value={selected.userPhone || "Non disponibile"}
                  />
                </div>
              )}
              <Divider />
              <h2 className="text-xs font-semibold text-gray-900">
                Stato conversazione
              </h2>
              <div className="mt-3 space-y-2">
                <StateLine
                  label="Stato"
                  value={selected.isResolved ? "Risolta" : "Aperta"}
                  good={selected.isResolved}
                />
                <StateLine
                  label="Handoff"
                  value={selected.needsHumanEscalation ? "Richiesto" : "No"}
                  good={!selected.needsHumanEscalation}
                />
                <StateLine
                  label="Assegnata a"
                  value={selected.assignedAgent || "Non assegnata"}
                />
                <StateLine
                  label="Intento"
                  value={selected.userIntent || "Non rilevato"}
                />
              </div>
              {selected.escalationReason && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-[10px] leading-4 text-amber-700">
                  {selected.escalationReason}
                </div>
              )}
              <Divider />
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-900">
                  Riepilogo AI
                </h2>
                <button
                  onClick={() => assist("summary")}
                  disabled={Boolean(aiBusy)}
                  className="flex items-center gap-1 text-[9px] font-semibold text-brand-600 disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  {aiBusy === "summary" ? "Analisi..." : "Aggiorna"}
                </button>
              </div>
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-[10px] leading-5 text-gray-500">
                {selected.summary ||
                  "Genera un riepilogo operativo della conversazione."}
              </p>
              <Divider />
              <div className="flex items-center gap-1.5">
                <TagIcon className="h-3.5 w-3.5 text-gray-400" />
                <h2 className="text-xs font-semibold text-gray-900">Tag</h2>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selected.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[9px] font-semibold text-brand-700"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      aria-label={`Rimuovi tag ${tag}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                <input
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  className="input py-1.5 text-[10px]"
                  placeholder="Aggiungi tag"
                />
                <button
                  onClick={addTag}
                  disabled={!tagDraft.trim()}
                  aria-label="Aggiungi tag"
                  className="rounded-lg border px-2 text-gray-500 disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <Divider />
              <div className="flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5 text-gray-400" />
                <h2 className="text-xs font-semibold text-gray-900">
                  Note interne
                </h2>
              </div>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                className="textarea mt-3 min-h-24 text-[10px] leading-4"
                placeholder="Contesto privato, prossimi passi, dettagli da ricordare..."
              />
              <Button
                size="sm"
                variant="secondary"
                fullWidth
                className="mt-2"
                disabled={busy || noteDraft === (selected.internalNotes || "")}
                onClick={() =>
                  patchSelected({ internalNotes: noteDraft || null })
                }
              >
                Salva nota
              </Button>
              <Divider />
              <div className="grid grid-cols-2 gap-2">
                <MiniMetric
                  icon={MessageSquare}
                  label="Messaggi"
                  value={selected.messages.length}
                />
                <MiniMetric
                  icon={Clock3}
                  label="Stato"
                  value={selected.isResolved ? "Chiusa" : "Attiva"}
                />
              </div>
            </>
          )}
        </aside>
      </div>
      {revisionTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/55 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={(event) => event.target === event.currentTarget && !revisionBusy && setRevisionTarget(null)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="revision-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <p className="eyebrow">Apprendimento supervisionato</p>
                <h2 id="revision-title" className="mt-1 text-lg font-bold text-gray-950">Correggi e insegna al chatbot</h2>
                <p className="mt-1 text-[11px] text-gray-500">Il messaggio storico resta immutato. La correzione diventa una Q&A verificata e un test anti-regressione.</p>
              </div>
              <button disabled={revisionBusy} onClick={() => setRevisionTarget(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-50" aria-label="Chiudi">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {!revisionReview ? (
                <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
                  <div className="space-y-4">
                    <label className="block">
                      <span className="label">Domanda canonica dell’utente</span>
                      <textarea className="textarea mt-1 min-h-20 text-xs" value={revisionQuestion} onChange={(event) => setRevisionQuestion(event.target.value)} />
                    </label>
                    <label className="block">
                      <span className="label">Risposta corretta e verificata</span>
                      <textarea className="textarea mt-1 min-h-40 text-xs leading-5" value={revisionAnswer} onChange={(event) => setRevisionAnswer(event.target.value)} />
                    </label>
                    <label className="block">
                      <span className="label">Perché la risposta originale era sbagliata (nota interna)</span>
                      <textarea className="textarea mt-1 min-h-20 text-xs" value={revisionRationale} onChange={(event) => setRevisionRationale(event.target.value)} placeholder="Es. categoria dimenticata, prodotto non pertinente, informazione mancante..." />
                    </label>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-gray-50 p-4">
                      <p className="label">Risposta originale</p>
                      <div className="mt-2 max-h-44 overflow-y-auto text-[11px] leading-5 text-gray-600"><SafeRichText content={revisionTarget.content} /></div>
                    </div>
                    <label className="block">
                      <span className="label">Parole o frasi che devono comparire</span>
                      <input className="input mt-1 text-xs" value={revisionExpected} onChange={(event) => setRevisionExpected(event.target.value)} placeholder="lino, donna, disponibile" />
                      <span className="mt-1 block text-[9px] text-gray-400">Separate da virgola. Se vuoto, vengono proposte automaticamente.</span>
                    </label>
                    <label className="block">
                      <span className="label">Parole vietate nel test</span>
                      <input className="input mt-1 text-xs" value={revisionForbidden} onChange={(event) => setRevisionForbidden(event.target.value)} placeholder="giacca, uomo" />
                    </label>
                    <div className="rounded-xl bg-amber-50 p-4 text-[10px] leading-5 text-amber-800">
                      Non inserire email, telefoni, dati di pagamento o credenziali. Il server blocca automaticamente questi dati prima dell’indicizzazione.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border p-4">
                    <p className="label">Domanda verificata</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">{revisionQuestion}</p>
                    <p className="label mt-5">Risposta che verrà indicizzata</p>
                    <div className="mt-2 text-xs leading-6 text-gray-700"><SafeRichText content={revisionAnswer} /></div>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-xl bg-emerald-50 p-4 text-[11px] leading-5 text-emerald-800">
                      <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Pubblicazione controllata</div>
                      <p className="mt-2">Verrà creata una sola fonte Q&A verificata, una versione auditabile e un caso di valutazione attivo. La versione pubblicata precedente verrà disattivata per evitare contraddizioni.</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="label">Criteri anti-regressione</p>
                      <p className="mt-2 text-[11px] text-gray-600"><strong>Attesi:</strong> {revisionExpected || "—"}</p>
                      <p className="mt-2 text-[11px] text-gray-600"><strong>Vietati:</strong> {revisionForbidden || "nessuno"}</p>
                    </div>
                  </div>
                </div>
              )}
              {revisionTarget.responseRevisions && revisionTarget.responseRevisions.length > 0 && (
                <div className="mt-5 border-t pt-4">
                  <p className="label">Cronologia versioni</p>
                  <div className="mt-2 space-y-2">
                    {revisionTarget.responseRevisions.map((revision) => (
                      <div key={revision.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-[10px]">
                        <span className="font-semibold text-gray-700">v{revision.version} · {revision.status}</span>
                        {revision.status === "published" && (
                          <button disabled={revisionBusy} onClick={() => archiveRevision(revision)} className="flex items-center gap-1 font-semibold text-red-600 disabled:opacity-50"><Archive className="h-3 w-3" /> Rimuovi dalla KB</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {revisionError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{revisionError}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t p-4">
              <Button variant="secondary" disabled={revisionBusy} onClick={() => revisionReview ? setRevisionReview(false) : setRevisionTarget(null)}>{revisionReview ? "Torna alla modifica" : "Annulla"}</Button>
              {!revisionReview ? (
                <Button loading={revisionBusy} disabled={!revisionQuestion.trim() || revisionAnswer.trim().length < 10} onClick={saveRevisionDraft} icon={<ShieldCheck className="h-4 w-4" />}>Salva e rivedi</Button>
              ) : (
                <Button variant="success" loading={revisionBusy} onClick={publishRevision} icon={<Check className="h-4 w-4" />}>Pubblica Q&A verificata</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function displayName(item: Conversation) {
  return (
    item.userName ||
    item.userEmail ||
    `Visitatore ${item.userSessionId.slice(-6)}`
  );
}
function channelLabel(channel: string) {
  return (
    (
      {
        whatsapp: "WhatsApp",
        instagram: "Instagram",
        widget: "Widget web",
      } as Record<string, string>
    )[channel] || channel
  );
}
function deliveryLabel(status: string) {
  return (
    (
      {
        pending: "invio…",
        sent: "inviato",
        delivered: "consegnato",
        read: "letto",
        failed: "non consegnato",
        received: "ricevuto",
      } as Record<string, string>
    )[status] || status
  );
}
function relativeDate(value: string) {
  const hours = Math.floor((Date.now() - new Date(value).getTime()) / 36e5);
  return hours < 1
    ? "Ora"
    : hours < 24
      ? `${hours}h`
      : new Date(value).toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "short",
        });
}
function Tag({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "red" | "green" | "gray" | "brand";
}) {
  const classes = {
    red: "bg-red-50 text-red-600",
    green: "bg-emerald-50 text-emerald-600",
    gray: "bg-gray-100 text-gray-500",
    brand: "bg-brand-50 text-brand-600",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${classes[color]}`}
    >
      {children}
    </span>
  );
}
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wider text-gray-400">
          {label}
        </p>
        <p className="truncate text-[11px] font-medium text-gray-700">
          {value}
        </p>
      </div>
    </div>
  );
}
function StateLine({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-gray-400">{label}</span>
      <span
        className={`font-semibold ${good === true ? "text-emerald-600" : good === false ? "text-amber-600" : "text-gray-700"}`}
      >
        {value}
      </span>
    </div>
  );
}
function Divider() {
  return <div className="my-5 border-t" />;
}
function MiniMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bot;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border p-3">
      <Icon className="h-3.5 w-3.5 text-brand-600" />
      <p className="mt-2 text-[9px] text-gray-400">{label}</p>
      <p className="text-xs font-semibold text-gray-800">{value}</p>
    </div>
  );
}
function ContactEditor({
  conversation,
  onSave,
}: {
  conversation: Conversation;
  onSave: (data: Partial<Conversation>) => void;
}) {
  const [name, setName] = useState(conversation.userName || "");
  const [email, setEmail] = useState(conversation.userEmail || "");
  const [phone, setPhone] = useState(conversation.userPhone || "");
  return (
    <div className="mt-4 space-y-3">
      <input
        className="input text-xs"
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="input text-xs"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="input text-xs"
        placeholder="Telefono"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Button
        size="sm"
        fullWidth
        onClick={() =>
          onSave({
            userName: name || null,
            userEmail: email || null,
            userPhone: phone || null,
          })
        }
      >
        Salva contatto
      </Button>
    </div>
  );
}
