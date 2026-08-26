import assert from "node:assert/strict";
import {
  buildCommerceFunnelComparison,
  buildLeadPipeline,
  buildNoMatchComparison,
  comparePeriods,
} from "../lib/commercial-analytics";

const previousStart = new Date("2026-06-01T00:00:00.000Z");
const currentStart = new Date("2026-07-01T00:00:00.000Z");
const currentEnd = new Date("2026-08-01T00:00:00.000Z");
const event = (id: string, eventType: string, createdAt: string, conversationId: string | null, value: number | null = null) => ({
  id, botId: "bot-1", eventType, createdAt: new Date(createdAt), conversationId, sessionId: conversationId ? null : `session-${id}`, value, currency: value === null ? null : "eur",
});

const funnel = buildCommerceFunnelComparison([
  event("p1", "impression", "2026-06-04T10:00:00Z", "old-1"),
  event("p2", "conversion", "2026-06-04T10:05:00Z", "old-1", 50),
  event("1", "impression", "2026-07-04T10:00:00Z", "chat-1"),
  event("2", "impression", "2026-07-04T10:00:01Z", "chat-1"),
  event("3", "impression", "2026-07-05T10:00:00Z", "chat-2"),
  event("4", "click", "2026-07-05T10:01:00Z", "chat-1"),
  event("5", "add_to_cart", "2026-07-05T10:02:00Z", "chat-1"),
  event("6", "conversion_item", "2026-07-05T10:03:00Z", "chat-1", 999),
  event("7", "conversion", "2026-07-05T10:04:00Z", "chat-1", 79.9),
  { ...event("8", "impression", "2026-07-06T10:00:00Z", null), sessionId: "shared-session" },
  { ...event("9", "impression", "2026-07-06T10:00:00Z", null), botId: "bot-2", sessionId: "shared-session" },
  event("10", "impression", "2026-08-01T00:00:00Z", "outside-current-window"),
], previousStart, currentStart, currentEnd);
assert.equal(funnel.stages[0].conversations, 4, "Deduplica per agente e conversazione/sessione, senza fondere clienti diversi");
assert.equal(funnel.stages.at(-1)?.conversations, 1);
assert.equal(funnel.stages.at(-1)?.fromImpressionPercent, 25);
assert.deepEqual(funnel.revenue, [{ currency: "EUR", value: 79.9 }], "Gli item non devono gonfiare il fatturato");
assert.equal(funnel.stages.at(-1)?.comparison.previous, 1);

const metadata = (toolTrace: unknown[], activeProductIds: string[] = []) => JSON.stringify({ metadata: { toolTrace, activeProductIds } });
const noMatch = buildNoMatchComparison([
  { createdAt: new Date("2026-06-05T00:00:00Z"), sourcesUsed: metadata([{ name: "search_products", success: true, resultCount: 1 }]) },
  { createdAt: new Date("2026-07-05T00:00:00Z"), sourcesUsed: metadata([{ name: "search_products", success: true, resultCount: 0 }]) },
  { createdAt: new Date("2026-07-06T00:00:00Z"), sourcesUsed: metadata([{ name: "search_products", success: true, resultCount: 0 }, { name: "search_products", success: true, resultCount: 2 }], ["product-1"]) },
  { createdAt: new Date("2026-07-07T00:00:00Z"), sourcesUsed: JSON.stringify({ metadata: { responseType: "verified_catalog_no_match" } }) },
  { createdAt: new Date("2026-07-08T00:00:00Z"), sourcesUsed: "non-json" },
], previousStart, currentStart, currentEnd);
assert.deepEqual({ searches: noMatch.searches, noMatches: noMatch.noMatches, rate: noMatch.ratePercent }, { searches: 3, noMatches: 2, rate: 66.7 });
assert.equal(noMatch.previous.ratePercent, 0);
assert.equal(noMatch.rateChangePoints, 66.7);

const leads = buildLeadPipeline([
  { stage: "new", createdAt: new Date("2026-07-02"), lastInteraction: new Date("2026-07-20") },
  { stage: "qualified", createdAt: new Date("2026-07-03"), lastInteraction: new Date("2026-07-21") },
  { stage: "qualified", createdAt: new Date("2026-06-03"), lastInteraction: new Date("2026-06-21") },
], previousStart, currentStart, currentEnd);
assert.equal(leads.total, 3);
assert.equal(leads.activeInPeriod, 2);
assert.deepEqual(leads.stages, [{ stage: "qualified", contacts: 2 }, { stage: "new", contacts: 1 }]);
assert.deepEqual(leads.created, { current: 2, previous: 1, changePercent: 100 });
assert.deepEqual(comparePeriods(0, 0), { current: 0, previous: 0, changePercent: 0 });
assert.deepEqual(comparePeriods(4, 0), { current: 4, previous: 0, changePercent: null });

console.log(JSON.stringify({ success: true, checks: 18 }));
