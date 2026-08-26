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
  createdAt: Date;
  lastInteraction: Date;
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
