import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildHelpDeskEventMetadata,
  calculateHelpDeskDeadlines,
  calculateHelpDeskSlaAnalytics,
  DEFAULT_HELP_DESK_SLA,
  normalizeHelpDeskPriority,
  normalizeHelpDeskSlaPolicy,
  resolveHelpDeskSlaPolicy,
  planHelpDeskEscalation,
  planHelpDeskOperatorReply,
  planHelpDeskPriorityChange,
  planHelpDeskReopen,
  planHelpDeskResolution,
  planHelpDeskReturnToBot,
  recordHelpDeskEventBestEffort,
  type HelpDeskState,
} from "../lib/helpdesk-operations";

const minute = 60_000;
const escalatedAt = new Date("2026-08-18T10:00:00.000Z");

function state(overrides: Partial<HelpDeskState> = {}): HelpDeskState {
  return {
    isResolved: false,
    needsHumanEscalation: false,
    escalatedAt: null,
    escalationReason: null,
    assignedAgent: null,
    priority: "normal",
    handoffSequence: 0,
    firstResponseDueAt: null,
    resolutionDueAt: null,
    firstHumanResponseAt: null,
    lastHumanResponseAt: null,
    resolvedAt: null,
    reopenedAt: null,
    ...overrides,
  };
}

assert.deepEqual(normalizeHelpDeskSlaPolicy(undefined), DEFAULT_HELP_DESK_SLA);
assert.deepEqual(normalizeHelpDeskSlaPolicy({ firstResponseMinutes: 30, resolutionMinutes: 15 }), {
  firstResponseMinutes: 30,
  resolutionMinutes: 30,
});
assert.deepEqual(normalizeHelpDeskSlaPolicy({ firstResponseMinutes: 0, resolutionMinutes: 99_999 }), {
  firstResponseMinutes: 1,
  resolutionMinutes: 43_200,
});
assert.equal(normalizeHelpDeskPriority("urgent"), "urgent");
assert.equal(normalizeHelpDeskPriority("critical"), "normal");
assert.deepEqual(resolveHelpDeskSlaPolicy({}, "urgent"), { firstResponseMinutes: 15, resolutionMinutes: 240 });
assert.deepEqual(resolveHelpDeskSlaPolicy({ helpdeskSla: { high: { firstResponseMinutes: 20, resolutionMinutes: 300 } } }, "high"), { firstResponseMinutes: 20, resolutionMinutes: 300 });

const deadlines = calculateHelpDeskDeadlines(escalatedAt, {
  firstResponseMinutes: 15,
  resolutionMinutes: 120,
});
assert.equal(deadlines.firstResponseDueAt.toISOString(), "2026-08-18T10:15:00.000Z");
assert.equal(deadlines.resolutionDueAt.toISOString(), "2026-08-18T12:00:00.000Z");

const escalated = planHelpDeskEscalation(state(), {
  at: escalatedAt,
  reason: "  Cliente insoddisfatto  ",
  assignedAgent: "  Assistenza negozio  ",
  priority: "high",
  sla: { firstResponseMinutes: 15, resolutionMinutes: 120 },
});
assert.equal(escalated.changed, true);
assert.equal(escalated.patch.needsHumanEscalation, true);
assert.equal(escalated.patch.isResolved, false);
assert.equal(escalated.patch.escalationReason, "Cliente insoddisfatto");
assert.equal(escalated.patch.assignedAgent, "Assistenza negozio");
assert.equal(escalated.patch.priority, "high");
assert.equal(escalated.patch.handoffSequence, 1);
assert.equal(escalated.patch.firstResponseDueAt?.toISOString(), "2026-08-18T10:15:00.000Z");
assert.equal(escalated.patch.resolutionDueAt?.toISOString(), "2026-08-18T12:00:00.000Z");
assert.equal(escalated.patch.firstHumanResponseAt, null);
assert.equal(escalated.patch.lastHumanResponseAt, null);

const activeState = state({ ...escalated.patch, handoffSequence: 1 } as Partial<HelpDeskState>);
assert.deepEqual(planHelpDeskEscalation(activeState, { at: new Date(escalatedAt.getTime() + minute) }), {
  changed: false,
  patch: {},
});

const escalatedResolved = planHelpDeskEscalation(state({
  isResolved: true,
  resolvedAt: new Date("2026-08-18T09:00:00.000Z"),
  handoffSequence: 3,
}), { at: escalatedAt });
assert.equal(escalatedResolved.patch.handoffSequence, 4);
assert.equal(escalatedResolved.patch.resolvedAt, null);
assert.equal(escalatedResolved.patch.reopenedAt, escalatedAt);

const returned = planHelpDeskReturnToBot(activeState);
assert.equal(returned.changed, true);
assert.deepEqual(returned.patch, {
  needsHumanEscalation: false,
  escalationReason: null,
  assignedAgent: null,
});
assert.equal(planHelpDeskReturnToBot(state()).changed, false);

const resolvedAt = new Date("2026-08-18T11:00:00.000Z");
const resolved = planHelpDeskResolution(activeState, resolvedAt);
assert.equal(resolved.changed, true);
assert.equal(resolved.patch.isResolved, true);
assert.equal(resolved.patch.resolvedAt, resolvedAt);
assert.equal(resolved.patch.needsHumanEscalation, false);
assert.equal(planHelpDeskResolution(state({ isResolved: true }), resolvedAt).changed, false);

const reopenedAt = new Date("2026-08-18T12:00:00.000Z");
const reopened = planHelpDeskReopen(state({ isResolved: true, resolvedAt }), reopenedAt);
assert.equal(reopened.changed, true);
assert.equal(reopened.patch.isResolved, false);
assert.equal(reopened.patch.resolvedAt, null);
assert.equal(reopened.patch.reopenedAt, reopenedAt);
assert.equal(reopened.patch.needsHumanEscalation, false);
assert.equal(reopened.patch.assignedAgent, null);
assert.equal(planHelpDeskReopen(state(), reopenedAt).changed, false);

const firstReply = new Date("2026-08-18T10:10:00.000Z");
const laterReply = new Date("2026-08-18T10:20:00.000Z");
const operatorReply = planHelpDeskOperatorReply(activeState, firstReply);
assert.equal(operatorReply.changed, true);
assert.equal(operatorReply.patch.firstHumanResponseAt, firstReply);
assert.equal(operatorReply.patch.lastHumanResponseAt, firstReply);
const outOfOrderReply = planHelpDeskOperatorReply(state({
  ...activeState,
  firstHumanResponseAt: laterReply,
  lastHumanResponseAt: laterReply,
}), firstReply);
assert.equal(outOfOrderReply.patch.firstHumanResponseAt, firstReply);
assert.equal(outOfOrderReply.patch.lastHumanResponseAt, laterReply);
assert.equal(planHelpDeskOperatorReply(state(), firstReply).changed, false);

const priorityWhilePending = planHelpDeskPriorityChange(activeState, {
  priority: "urgent",
  sla: { firstResponseMinutes: 5, resolutionMinutes: 30 },
});
assert.equal(priorityWhilePending.patch.priority, "urgent");
assert.equal(priorityWhilePending.patch.firstResponseDueAt?.toISOString(), "2026-08-18T10:05:00.000Z");
assert.equal(priorityWhilePending.patch.resolutionDueAt?.toISOString(), "2026-08-18T10:30:00.000Z");

const priorityAfterFirstResponse = planHelpDeskPriorityChange(state({
  ...activeState,
  firstHumanResponseAt: firstReply,
}), {
  priority: "urgent",
  sla: { firstResponseMinutes: 5, resolutionMinutes: 30 },
});
assert.equal(Object.hasOwn(priorityAfterFirstResponse.patch, "firstResponseDueAt"), false);
assert.equal(priorityAfterFirstResponse.patch.resolutionDueAt?.toISOString(), "2026-08-18T10:30:00.000Z");

const priorityAfterResolution = planHelpDeskPriorityChange(state({
  ...activeState,
  isResolved: true,
  needsHumanEscalation: false,
  firstHumanResponseAt: firstReply,
  resolvedAt,
}), {
  priority: "low",
  sla: { firstResponseMinutes: 240, resolutionMinutes: 4_320 },
});
assert.equal(priorityAfterResolution.patch.priority, "low");
assert.equal(Object.hasOwn(priorityAfterResolution.patch, "firstResponseDueAt"), false);
assert.equal(Object.hasOwn(priorityAfterResolution.patch, "resolutionDueAt"), false);
assert.equal(planHelpDeskPriorityChange(activeState, { priority: "high", sla: {} }).changed, false);

const noSla = calculateHelpDeskSlaAnalytics(state(), escalatedAt);
assert.equal(noSla.firstResponseStatus, "not_applicable");
assert.equal(noSla.resolutionStatus, "not_applicable");

const pending = calculateHelpDeskSlaAnalytics(activeState, new Date("2026-08-18T10:05:00.000Z"));
assert.equal(pending.firstResponseStatus, "pending");
assert.equal(pending.resolutionStatus, "pending");
assert.equal(pending.firstResponseRemainingMs, 10 * minute);

const breached = calculateHelpDeskSlaAnalytics(activeState, new Date("2026-08-18T12:01:00.000Z"));
assert.equal(breached.firstResponseStatus, "breached");
assert.equal(breached.resolutionStatus, "breached");
assert.equal(breached.resolutionRemainingMs, -minute);

const met = calculateHelpDeskSlaAnalytics(state({
  ...activeState,
  isResolved: true,
  needsHumanEscalation: false,
  firstHumanResponseAt: firstReply,
  resolvedAt,
}), new Date("2026-08-18T13:00:00.000Z"));
assert.equal(met.firstResponseStatus, "met");
assert.equal(met.resolutionStatus, "met");
assert.equal(met.firstResponseDurationMs, 10 * minute);
assert.equal(met.resolutionDurationMs, 60 * minute);
assert.equal(met.firstResponseRemainingMs, null);

const cancelled = calculateHelpDeskSlaAnalytics(state({
  ...activeState,
  needsHumanEscalation: false,
}), new Date("2026-08-18T13:00:00.000Z"));
assert.equal(cancelled.firstResponseStatus, "cancelled");
assert.equal(cancelled.resolutionStatus, "cancelled");

const eventMetadata = buildHelpDeskEventMetadata(state({
  ...activeState,
  isResolved: true,
  needsHumanEscalation: false,
  firstHumanResponseAt: firstReply,
  resolvedAt,
}), resolvedAt, { previousPriority: "normal" });
assert.equal(eventMetadata.handoffSequence, 1);
assert.equal(eventMetadata.occurredAt, "2026-08-18T11:00:00.000Z");
assert.equal(eventMetadata.firstResponseDueAt, "2026-08-18T10:15:00.000Z");
assert.equal(eventMetadata.resolutionDueAt, "2026-08-18T12:00:00.000Z");
assert.equal(eventMetadata.firstResponseDurationMs, 10 * minute);
assert.equal(eventMetadata.resolutionDurationMs, 60 * minute);
assert.equal(eventMetadata.previousPriority, "normal");
assert.doesNotMatch(JSON.stringify(eventMetadata), /assignedAgent|escalationReason|userEmail|userPhone/i);

const root = process.cwd();
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(root, "prisma/migrations/20260818190000_add_helpdesk_operations/migration.sql"), "utf8");
const service = readFileSync(resolve(root, "lib/helpdesk-operations.ts"), "utf8");
const chatRoute = readFileSync(resolve(root, "app/api/chat/route.ts"), "utf8");
const agenticRuntime = readFileSync(resolve(root, "lib/agentic-chat-runtime.ts"), "utf8");
const channelRuntime = readFileSync(resolve(root, "lib/channel-message-processor.ts"), "utf8");
const messageRoute = readFileSync(resolve(root, "app/api/messages/route.ts"), "utf8");
const savedViewSchema = readFileSync(resolve(root, "lib/helpdesk-filters.ts"), "utf8");
const conversationRoute = readFileSync(resolve(root, "app/api/conversations/route.ts"), "utf8");
for (const field of [
  "priority",
  "handoffSequence",
  "firstResponseDueAt",
  "resolutionDueAt",
  "firstHumanResponseAt",
  "lastHumanResponseAt",
  "resolvedAt",
  "reopenedAt",
  "operatorAuthored",
  "HelpDeskSavedView",
]) assert.match(schema, new RegExp(field));
assert.match(migration, /conversations_priority_check/);
assert.match(migration, /helpdesk_saved_views_name_key/);
assert.match(service, /id: input\.conversationId,\s*botId: input\.botId/);
assert.match(service, /LEAST\(COALESCE\("firstHumanResponseAt"/);
assert.match(service, /GREATEST\(COALESCE\("lastHumanResponseAt"/);
assert.match(service, /helpdesk\.handoff_requested/);
assert.match(service, /helpdesk\.priority_changed/);
assert.match(service, /recordHelpDeskEventBestEffort/);
assert.match(service, /outcome: "record_failed"/);
assert.match(service, /buildHelpDeskEventMetadata\(conversation, occurredAt/);
assert.match(chatRoute, /conversation\.needsHumanEscalation && !conversation\.isResolved/);
assert.match(chatRoute, /reopenHelpDeskConversation/);
assert.match(chatRoute, /agentic\.handoffTransitioned/);
assert.match(agenticRuntime, /escalateHelpDeskConversation/);
assert.doesNotMatch(agenticRuntime, /needsHumanEscalation:\s*true/);
assert.match(channelRuntime, /reopenHelpDeskConversation/);
assert.ok(channelRuntime.indexOf("reopenHelpDeskConversation({") < channelRuntime.indexOf("if (conversation.needsHumanEscalation && !conversation.isResolved) return"));
assert.equal((channelRuntime.match(/reopenHelpDeskConversation\(\{/g) || []).length, 1);
assert.match(messageRoute, /operatorAuthored: validatedData\.role === 'assistant'/);
assert.match(savedViewSchema, /\.strict\(\)/);
assert.doesNotMatch(savedViewSchema, /\bquery\b|\bsearch\b/);
assert.doesNotMatch(savedViewSchema, /tags:/);
assert.match(conversationRoute, /assignment: z\.enum/);
assert.match(conversationRoute, /encodeConversationCursor/);
assert.match(conversationRoute, /decodeConversationCursor/);
assert.match(conversationRoute, /resolutionDueAt: \{ not: null, gte: now \}/);

async function verifyBestEffortEventRecording() {
  const logs: Array<Record<string, string | number>> = [];
  const input = {
    botId: "11111111-1111-4111-8111-111111111111",
    conversationId: "22222222-2222-4222-8222-222222222222",
    eventType: "helpdesk.operator_replied",
    occurredAt: firstReply,
    metadata: eventMetadata,
  };
  const recorded = await recordHelpDeskEventBestEffort(input, {
    create: async () => ({ id: "event" }),
    log: (entry) => logs.push(entry),
  });
  assert.equal(recorded, true);
  assert.equal(logs.length, 0);

  const notRecorded = await recordHelpDeskEventBestEffort(input, {
    create: async () => { throw new Error("database unavailable"); },
    log: (entry) => logs.push(entry),
  });
  assert.equal(notRecorded, false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].outcome, "record_failed");
  assert.equal(logs[0].handoffSequence, 1);
  assert.equal("errorMessage" in logs[0], false);
}

void verifyBestEffortEventRecording()
  .then(() => console.log("Help Desk operations: suite pura completata"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
