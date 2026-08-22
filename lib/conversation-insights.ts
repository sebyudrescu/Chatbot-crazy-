import { createHash } from "node:crypto";

const SENSITIVE_PATTERN = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\+?\d(?:[ .()-]?\d){8,}|\b(?:\d[ -]?){13,19}\b|\b\d{4,}\b|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|\b(?:Bearer\s+)?(?:sk|shpat|shpca|shpss)_[A-Za-z0-9_-]{10,}\b)/i;
const GENERIC_TOPICS = new Set(["altro", "altre informazioni", "generale", "informazioni", "richiesta", "supporto", "domanda", "other", "general", "information"]);
const STOPWORDS = new Set(["a", "al", "alla", "alle", "con", "da", "dei", "del", "della", "di", "e", "gli", "i", "il", "in", "la", "le", "lo", "per", "su", "un", "una", "the", "and", "for", "of", "to"]);

export interface ConversationTopicInput {
  id: string;
  botId: string;
  channel: string;
  topicsDiscussed: string | null;
  needsHumanEscalation: boolean;
  negativeFeedback: number;
  lowConfidenceAnswers: number;
}

export interface RecurringTopicInsight {
  botId: string;
  key: string;
  label: string;
  conversationCount: number;
  negativeFeedback: number;
  handoffs: number;
  lowConfidenceAnswers: number;
  channels: Array<{ channel: string; conversations: number }>;
}

export interface PublishedRevisionInput {
  id: string;
  botId: string;
  question: string;
  knowledgeSourceId: string | null;
  publishedAt: Date | null;
}

export interface RevisionMessageInput {
  botId: string;
  createdAt: Date;
  feedback: string | null;
  sourcesUsed: string | null;
}

export interface RevisionOutcomeInsight {
  revisionId: string;
  botId: string;
  question: string;
  exposureCount: number;
  positiveFeedback: number;
  negativeFeedback: number;
  lowConfidenceAnswers: number;
  negativeRatePercent: number | null;
  lastUsedAt: Date | null;
  sampleReady: boolean;
}

function normalizeText(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("it")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function topicTokens(value: string) {
  return normalizeText(value).split(" ").filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function isSafeTopic(value: string) {
  const normalized = normalizeText(value);
  return normalized.length >= 3 && normalized.length <= 80 && !GENERIC_TOPICS.has(normalized) && !SENSITIVE_PATTERN.test(value);
}

export function sanitizeConversationTopic(value: unknown) {
  if (typeof value !== "string" || !isSafeTopic(value)) return null;
  return normalizeText(value).slice(0, 80);
}

function parseTopics(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(sanitizeConversationTopic).filter((item): item is string => Boolean(item)))];
  } catch {
    return [];
  }
}

function similarity(left: string[], right: string[]) {
  const a = new Set(left), b = new Set(right);
  const intersection = [...a].filter((token) => b.has(token)).length;
  if (!intersection) return 0;
  return Math.max(intersection / Math.min(a.size, b.size), intersection / new Set([...a, ...b]).size);
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

export function buildRecurringTopicInsights(rows: ConversationTopicInput[], minimumConversations = 5) {
  const byBot = new Map<string, Array<{ label: string; tokens: string[]; conversations: Map<string, ConversationTopicInput> }>>();
  for (const row of rows) {
    const clusters = byBot.get(row.botId) || [];
    for (const topic of parseTopics(row.topicsDiscussed)) {
      const tokens = topicTokens(topic);
      if (!tokens.length) continue;
      const cluster = clusters.find((candidate) => similarity(candidate.tokens, tokens) >= 0.67);
      if (cluster) cluster.conversations.set(row.id, row);
      else clusters.push({ label: topic, tokens, conversations: new Map([[row.id, row]]) });
    }
    byBot.set(row.botId, clusters);
  }

  const insights: RecurringTopicInsight[] = [];
  for (const [botId, clusters] of byBot) {
    for (const cluster of clusters) {
      const conversations = [...cluster.conversations.values()];
      if (conversations.length < minimumConversations) continue;
      const channels = [...conversations.reduce((map, item) => map.set(item.channel, (map.get(item.channel) || 0) + 1), new Map<string, number>())]
        .map(([channel, count]) => ({ channel, conversations: count })).sort((a, b) => b.conversations - a.conversations || a.channel.localeCompare(b.channel));
      const canonical = cluster.tokens.slice().sort().join(" ");
      insights.push({
        botId,
        key: digest(`${botId}:${canonical}`),
        label: cluster.label.slice(0, 80),
        conversationCount: conversations.length,
        negativeFeedback: conversations.reduce((sum, item) => sum + item.negativeFeedback, 0),
        handoffs: conversations.filter((item) => item.needsHumanEscalation).length,
        lowConfidenceAnswers: conversations.reduce((sum, item) => sum + item.lowConfidenceAnswers, 0),
        channels,
      });
    }
  }
  return insights.sort((a, b) => b.conversationCount - a.conversationCount || a.label.localeCompare(b.label));
}

function parseSourceEnvelope(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const sources: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.sources) ? parsed.sources : [];
    const sourceIds = new Set(sources.map((source: unknown) => source && typeof source === "object" ? (source as Record<string, unknown>).sourceId : null).filter((id): id is string => typeof id === "string"));
    const confidence = typeof parsed?.metadata?.confidence === "number" ? parsed.metadata.confidence : null;
    return { sourceIds, confidence };
  } catch {
    return null;
  }
}

export function buildRevisionOutcomeInsights(revisions: PublishedRevisionInput[], messages: RevisionMessageInput[], minimumExposures = 5) {
  const parsedMessages = messages.map((message) => ({ ...message, envelope: parseSourceEnvelope(message.sourcesUsed) }));
  return revisions.filter((revision) => revision.knowledgeSourceId && revision.publishedAt).map((revision): RevisionOutcomeInsight => {
    const matches = parsedMessages.filter((message) => message.botId === revision.botId && message.createdAt >= revision.publishedAt! && message.envelope?.sourceIds.has(revision.knowledgeSourceId!));
    const positiveFeedback = matches.filter((message) => message.feedback === "positive").length;
    const negativeFeedback = matches.filter((message) => message.feedback === "negative").length;
    const rated = positiveFeedback + negativeFeedback;
    return {
      revisionId: revision.id,
      botId: revision.botId,
      question: revision.question,
      exposureCount: matches.length,
      positiveFeedback,
      negativeFeedback,
      lowConfidenceAnswers: matches.filter((message) => message.envelope?.confidence !== null && message.envelope!.confidence! < 0.55).length,
      negativeRatePercent: rated ? Number((negativeFeedback / rated * 100).toFixed(1)) : null,
      lastUsedAt: matches.reduce<Date | null>((latest, message) => !latest || message.createdAt > latest ? message.createdAt : latest, null),
      sampleReady: matches.length >= minimumExposures,
    };
  }).sort((a, b) => b.exposureCount - a.exposureCount || a.question.localeCompare(b.question));
}
