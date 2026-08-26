export const COMMERCE_FUNNEL_STAGES = [
  "impression",
  "click",
  "add_to_cart",
  "checkout",
  "conversion",
] as const;

export type CommerceFunnelStage = (typeof COMMERCE_FUNNEL_STAGES)[number];

interface CommerceEventRow {
  id: string;
  botId: string;
  conversationId: string | null;
  sessionId: string | null;
  eventType: string;
  value: number | null;
  currency: string | null;
  createdAt: Date;
}

interface AssistantMessageRow {
  sourcesUsed: string | null;
  createdAt: Date;
}

interface CRMContactRow {
  stage: string;
  source?: string;
  createdAt: Date;
  lastInteraction: Date;
}

interface ConversationChannelRow {
  id: string;
  botId: string;
  channel: string;
  startedAt: Date;
}

interface ActionExecutionRow {
  conversationId: string | null;
  success: boolean;
  status: string;
  durationMs: number | null;
  createdAt: Date;
  action: { id: string; botId: string; name: string; type: string };
}

export interface PeriodComparison {
  current: number;
  previous: number;
  changePercent: number | null;
}

export function comparePeriods(current: number, previous: number): PeriodComparison {
  return {
    current,
    previous,
    changePercent: previous > 0
      ? Number((((current - previous) / previous) * 100).toFixed(1))
      : current > 0 ? null : 0,
  };
}

function inWindow(value: Date, start: Date, end: Date) {
  return value >= start && value < end;
}

function attributionKey(event: CommerceEventRow) {
  return `${event.botId}:${event.conversationId || event.sessionId || `event:${event.id}`}`;
}

function funnelForWindow(events: CommerceEventRow[], start: Date, end: Date) {
  const keys = new Map<CommerceFunnelStage, Set<string>>(
    COMMERCE_FUNNEL_STAGES.map((stage) => [stage, new Set<string>()]),
  );
  const revenue = new Map<string, number>();
  for (const event of events) {
    if (!inWindow(event.createdAt, start, end)) continue;
    if (!COMMERCE_FUNNEL_STAGES.includes(event.eventType as CommerceFunnelStage)) continue;
    const stage = event.eventType as CommerceFunnelStage;
    keys.get(stage)!.add(attributionKey(event));
    if (stage === "conversion" && event.value !== null && Number.isFinite(event.value)) {
      const currency = (event.currency || "N/D").toUpperCase();
      revenue.set(currency, (revenue.get(currency) || 0) + event.value);
    }
  }
  const firstStage = keys.get("impression")!.size;
  return {
    stages: COMMERCE_FUNNEL_STAGES.map((stage, index) => {
      const conversations = keys.get(stage)!.size;
      const previousStage = index === 0 ? conversations : keys.get(COMMERCE_FUNNEL_STAGES[index - 1])!.size;
      return {
        stage,
        conversations,
        fromPreviousPercent: previousStage > 0 ? Math.round((conversations / previousStage) * 100) : null,
        fromImpressionPercent: firstStage > 0 ? Math.round((conversations / firstStage) * 100) : null,
      };
    }),
    revenue: [...revenue.entries()]
      .map(([currency, value]) => ({ currency, value: Number(value.toFixed(2)) }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
  };
}

export function buildCommerceFunnelComparison(
  events: CommerceEventRow[],
  previousStart: Date,
  currentStart: Date,
  currentEnd: Date,
) {
  const current = funnelForWindow(events, currentStart, currentEnd);
  const previous = funnelForWindow(events, previousStart, currentStart);
  const previousByStage = new Map(previous.stages.map((stage) => [stage.stage, stage.conversations]));
  return {
    stages: current.stages.map((stage) => ({
      ...stage,
      comparison: comparePeriods(stage.conversations, previousByStage.get(stage.stage) || 0),
    })),
    revenue: current.revenue,
    previousRevenue: previous.revenue,
  };
}

function parseMetadata(value: string | null) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed.metadata || {} : {};
  } catch {
    return {};
  }
}

function productSearchOutcome(message: AssistantMessageRow) {
  const metadata = parseMetadata(message.sourcesUsed) as Record<string, unknown>;
  const responseType = typeof metadata.responseType === "string" ? metadata.responseType : "";
  if (responseType === "verified_catalog_no_match") return { searched: true, noMatch: true };
  const trace = Array.isArray(metadata.toolTrace) ? metadata.toolTrace : [];
  const searches = trace.filter((item): item is Record<string, unknown> => Boolean(
    item && typeof item === "object" && (item as Record<string, unknown>).name === "search_products" && (item as Record<string, unknown>).success === true,
  ));
  if (!searches.length) return { searched: false, noMatch: false };
  const hasResult = searches.some((item) => typeof item.resultCount === "number" && item.resultCount > 0);
  const activeProducts = Array.isArray(metadata.activeProductIds) ? metadata.activeProductIds.length : 0;
  return { searched: true, noMatch: !hasResult && activeProducts === 0 };
}

function noMatchForWindow(messages: AssistantMessageRow[], start: Date, end: Date) {
  let searches = 0;
  let noMatches = 0;
  for (const message of messages) {
    if (!inWindow(message.createdAt, start, end)) continue;
    const outcome = productSearchOutcome(message);
    if (!outcome.searched) continue;
    searches++;
    if (outcome.noMatch) noMatches++;
  }
  return {
    searches,
    noMatches,
    ratePercent: searches > 0 ? Number(((noMatches / searches) * 100).toFixed(1)) : null,
  };
}

export function buildNoMatchComparison(
  messages: AssistantMessageRow[],
  previousStart: Date,
  currentStart: Date,
  currentEnd: Date,
) {
  const current = noMatchForWindow(messages, currentStart, currentEnd);
  const previous = noMatchForWindow(messages, previousStart, currentStart);
  return {
    ...current,
    previous,
    rateChangePoints: current.ratePercent !== null && previous.ratePercent !== null
      ? Number((current.ratePercent - previous.ratePercent).toFixed(1))
      : null,
  };
}

export function buildLeadPipeline(
  contacts: CRMContactRow[],
  previousStart: Date,
  currentStart: Date,
  currentEnd: Date,
) {
  const stageCounts = new Map<string, number>();
  for (const contact of contacts) {
    const stage = contact.stage.trim().toLowerCase() || "new";
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  }
  const currentCreated = contacts.filter((contact) => inWindow(contact.createdAt, currentStart, currentEnd)).length;
  const previousCreated = contacts.filter((contact) => inWindow(contact.createdAt, previousStart, currentStart)).length;
  return {
    total: contacts.length,
    activeInPeriod: contacts.filter((contact) => inWindow(contact.lastInteraction, currentStart, currentEnd)).length,
    created: comparePeriods(currentCreated, previousCreated),
    stages: [...stageCounts.entries()]
      .map(([stage, contacts]) => ({ stage, contacts }))
      .sort((left, right) => right.contacts - left.contacts || left.stage.localeCompare(right.stage)),
  };
}

function normalizedDimension(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function buildChannelPerformance(
  conversations: ConversationChannelRow[],
  events: CommerceEventRow[],
  contacts: CRMContactRow[],
  currentStart: Date,
  currentEnd: Date,
) {
  const channels = new Map<string, {
    channel: string;
    conversations: Set<string>;
    engaged: Set<string>;
    conversions: Set<string>;
    leads: number;
  }>();
  const conversationChannels = new Map<string, string>();
  const ensure = (channel: string) => {
    const current = channels.get(channel) || {
      channel,
      conversations: new Set<string>(),
      engaged: new Set<string>(),
      conversions: new Set<string>(),
      leads: 0,
    };
    channels.set(channel, current);
    return current;
  };

  for (const conversation of conversations) {
    const channel = normalizedDimension(conversation.channel, "unknown");
    conversationChannels.set(conversation.id, channel);
    if (inWindow(conversation.startedAt, currentStart, currentEnd)) {
      ensure(channel).conversations.add(`${conversation.botId}:${conversation.id}`);
    }
  }
  for (const event of events) {
    if (!inWindow(event.createdAt, currentStart, currentEnd)) continue;
    if (!["click", "add_to_cart", "checkout", "conversion"].includes(event.eventType)) continue;
    const channel = event.conversationId
      ? conversationChannels.get(event.conversationId) || "unattributed"
      : "unattributed";
    const row = ensure(channel);
    const key = attributionKey(event);
    row.engaged.add(key);
    if (event.eventType === "conversion") row.conversions.add(key);
  }
  for (const contact of contacts) {
    if (!inWindow(contact.createdAt, currentStart, currentEnd)) continue;
    ensure(normalizedDimension(contact.source, "unknown")).leads++;
  }

  return [...channels.values()]
    .map((row) => ({
      channel: row.channel,
      conversations: row.conversations.size,
      engagedConversations: row.engaged.size,
      leads: row.leads,
      conversions: row.conversions.size,
      conversionRatePercent: row.conversations.size > 0
        ? Number(((row.conversions.size / row.conversations.size) * 100).toFixed(1))
        : null,
    }))
    .sort((left, right) =>
      right.conversions - left.conversions ||
      right.engagedConversations - left.engagedConversations ||
      right.conversations - left.conversations ||
      left.channel.localeCompare(right.channel));
}

export function buildActionPerformance(
  executions: ActionExecutionRow[],
  currentStart: Date,
  currentEnd: Date,
) {
  const grouped = new Map<string, {
    actionId: string;
    botId: string;
    name: string;
    type: string;
    executions: number;
    successes: number;
    failures: number;
    pending: number;
    conversations: Set<string>;
    durations: number[];
  }>();
  for (const execution of executions) {
    if (!inWindow(execution.createdAt, currentStart, currentEnd)) continue;
    const action = execution.action;
    const row = grouped.get(action.id) || {
      actionId: action.id,
      botId: action.botId,
      name: action.name,
      type: action.type,
      executions: 0,
      successes: 0,
      failures: 0,
      pending: 0,
      conversations: new Set<string>(),
      durations: [],
    };
    row.executions++;
    if (execution.status === "pending") row.pending++;
    else if (execution.success) row.successes++;
    else row.failures++;
    if (execution.conversationId) row.conversations.add(execution.conversationId);
    if (execution.durationMs !== null && execution.durationMs >= 0) row.durations.push(execution.durationMs);
    grouped.set(action.id, row);
  }
  return [...grouped.values()]
    .map((row) => {
      const completed = row.successes + row.failures;
      return {
        actionId: row.actionId,
        botId: row.botId,
        name: row.name,
        type: row.type,
        executions: row.executions,
        successes: row.successes,
        failures: row.failures,
        pending: row.pending,
        conversations: row.conversations.size,
        successRatePercent: completed > 0 ? Number(((row.successes / completed) * 100).toFixed(1)) : null,
        averageLatencyMs: row.durations.length
          ? Math.round(row.durations.reduce((sum, value) => sum + value, 0) / row.durations.length)
          : null,
      };
    })
    .sort((left, right) => right.executions - left.executions || left.name.localeCompare(right.name));
}
