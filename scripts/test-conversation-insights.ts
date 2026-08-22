import assert from "node:assert/strict";
import { buildRecurringTopicInsights, buildRevisionOutcomeInsights, type ConversationTopicInput } from "../lib/conversation-insights";
import { isSuggestionRefreshFresh, SUGGESTION_REFRESH_WINDOW_MS } from "../lib/suggestion-refresh-policy";

const conversation = (id: string, botId: string, topics: string[], values: Partial<ConversationTopicInput> = {}): ConversationTopicInput => ({
  id, botId, channel: "widget", topicsDiscussed: JSON.stringify(topics), needsHumanEscalation: false,
  negativeFeedback: 0, lowConfidenceAnswers: 0, ...values,
});

const recurring = buildRecurringTopicInsights([
  conversation("a1", "bot-a", ["Tempi di spedizione", "tempi spedizione"], { negativeFeedback: 1 }),
  conversation("a2", "bot-a", ["Spedizione tempi"], { needsHumanEscalation: true }),
  conversation("a3", "bot-a", ["tempi di spedizione"], { lowConfidenceAnswers: 1 }),
  conversation("a4", "bot-a", ["Tempi spedizione"]),
  conversation("a5", "bot-a", ["tempi spedizione"]),
  conversation("b1", "bot-b", ["Tempi spedizione"]),
  conversation("pii", "bot-a", ["Ordine 123456", "cliente@example.com"]),
  conversation("other", "bot-a", ["Politica resi"]),
]);

assert.equal(recurring.length, 1, "solo il cluster sopra soglia deve emergere");
assert.equal(recurring[0].botId, "bot-a", "i dati non devono attraversare agenti");
assert.equal(recurring[0].conversationCount, 5, "un topic duplicato nella stessa conversazione conta una volta");
assert.equal(recurring[0].negativeFeedback, 1);
assert.equal(recurring[0].handoffs, 1);
assert.equal(recurring[0].lowConfidenceAnswers, 1);
assert.ok(!JSON.stringify(recurring).includes("123456") && !JSON.stringify(recurring).includes("cliente@example.com"), "PII e numeri ordine devono essere esclusi");

const sourceA = "11111111-1111-4111-8111-111111111111";
const sourceB = "22222222-2222-4222-8222-222222222222";
const publishedAt = new Date("2026-08-01T00:00:00.000Z");
const envelope = (sourceId: string, confidence: number) => JSON.stringify({ sources: [{ sourceId }], metadata: { confidence } });
const outcomes = buildRevisionOutcomeInsights([
  { id: "revision-a", botId: "bot-a", question: "Quanto costa la spedizione?", knowledgeSourceId: sourceA, publishedAt },
  { id: "revision-b", botId: "bot-b", question: "Resi", knowledgeSourceId: sourceB, publishedAt },
], [
  { botId: "bot-a", createdAt: new Date("2026-08-02T00:00:00Z"), feedback: "positive", sourcesUsed: envelope(sourceA, 0.9) },
  { botId: "bot-a", createdAt: new Date("2026-08-03T00:00:00Z"), feedback: "negative", sourcesUsed: envelope(sourceA, 0.4) },
  { botId: "bot-a", createdAt: new Date("2026-08-04T00:00:00Z"), feedback: null, sourcesUsed: envelope(sourceA, 0.8) },
  { botId: "bot-a", createdAt: new Date("2026-08-05T00:00:00Z"), feedback: null, sourcesUsed: envelope(sourceA, 0.8) },
  { botId: "bot-a", createdAt: new Date("2026-08-06T00:00:00Z"), feedback: null, sourcesUsed: envelope(sourceA, 0.8) },
  { botId: "bot-b", createdAt: new Date("2026-08-06T00:00:00Z"), feedback: "negative", sourcesUsed: envelope(sourceA, 0.1) },
  { botId: "bot-a", createdAt: new Date("2026-07-01T00:00:00Z"), feedback: "negative", sourcesUsed: envelope(sourceA, 0.1) },
  { botId: "bot-a", createdAt: new Date("2026-08-07T00:00:00Z"), feedback: "negative", sourcesUsed: envelope(`${sourceA}-suffix`, 0.1) },
  { botId: "bot-a", createdAt: new Date("2026-08-08T00:00:00Z"), feedback: null, sourcesUsed: "{malformed" },
]);

const revisionA = outcomes.find((item) => item.revisionId === "revision-a")!;
assert.equal(revisionA.exposureCount, 5, "contano solo source ID esatti, stesso bot e messaggi successivi alla pubblicazione");
assert.equal(revisionA.positiveFeedback, 1);
assert.equal(revisionA.negativeFeedback, 1);
assert.equal(revisionA.lowConfidenceAnswers, 1);
assert.equal(revisionA.negativeRatePercent, 50);
assert.equal(revisionA.sampleReady, true);
assert.equal(outcomes.find((item) => item.revisionId === "revision-b")?.exposureCount, 0);

const refreshNow = new Date("2026-08-22T12:00:00.000Z");
assert.equal(isSuggestionRefreshFresh(null, refreshNow), false, "senza un refresh riuscito i dati sono stale");
assert.equal(isSuggestionRefreshFresh(new Date(refreshNow.getTime() - SUGGESTION_REFRESH_WINDOW_MS + 1), refreshNow), true, "prima della soglia i dati sono freschi");
assert.equal(isSuggestionRefreshFresh(new Date(refreshNow.getTime() - SUGGESTION_REFRESH_WINDOW_MS), refreshNow), false, "alla soglia il refresh è dovuto");
assert.equal(isSuggestionRefreshFresh(new Date(refreshNow.getTime() + 1_000), refreshNow), true, "un lieve clock skew non deve generare refresh concorrenti");

console.log("Conversation insights: 21 controlli superati");
