import { Prisma, type Conversation } from "@prisma/client";
import { prisma } from "./db";

export const HELP_DESK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type HelpDeskPriority = (typeof HELP_DESK_PRIORITIES)[number];

export interface HelpDeskSlaPolicy {
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

export const DEFAULT_HELP_DESK_SLA: Readonly<HelpDeskSlaPolicy> = Object.freeze({
  firstResponseMinutes: 60,
  resolutionMinutes: 24 * 60,
});

export const DEFAULT_HELP_DESK_SLA_BY_PRIORITY: Readonly<Record<HelpDeskPriority, HelpDeskSlaPolicy>> = Object.freeze({
  low: { firstResponseMinutes: 240, resolutionMinutes: 3 * 24 * 60 },
  normal: DEFAULT_HELP_DESK_SLA,
  high: { firstResponseMinutes: 30, resolutionMinutes: 8 * 60 },
  urgent: { firstResponseMinutes: 15, resolutionMinutes: 4 * 60 },
});

const MAX_SLA_MINUTES = 30 * 24 * 60;

export function normalizeHelpDeskPriority(value: unknown): HelpDeskPriority {
  return HELP_DESK_PRIORITIES.includes(value as HelpDeskPriority)
    ? (value as HelpDeskPriority)
    : "normal";
}

export function normalizeHelpDeskSlaPolicy(value: unknown): HelpDeskSlaPolicy {
  const input = value && typeof value === "object"
    ? value as Partial<Record<keyof HelpDeskSlaPolicy, unknown>>
    : {};
  const firstResponseMinutes = boundedMinutes(
    input.firstResponseMinutes,
    DEFAULT_HELP_DESK_SLA.firstResponseMinutes,
  );
  const requestedResolution = boundedMinutes(
    input.resolutionMinutes,
    DEFAULT_HELP_DESK_SLA.resolutionMinutes,
  );
  return {
    firstResponseMinutes,
    resolutionMinutes: Math.max(firstResponseMinutes, requestedResolution),
  };
}

export function resolveHelpDeskSlaPolicy(settings: unknown, priority: unknown): HelpDeskSlaPolicy {
  const normalizedPriority = normalizeHelpDeskPriority(priority);
  const parsed = settings && typeof settings === "object" ? settings as Record<string, unknown> : {};
  const helpdesk = parsed.helpdeskSla && typeof parsed.helpdeskSla === "object"
    ? parsed.helpdeskSla as Record<string, unknown>
    : {};
  return normalizeHelpDeskSlaPolicy(helpdesk[normalizedPriority] ?? DEFAULT_HELP_DESK_SLA_BY_PRIORITY[normalizedPriority]);
}

export function calculateHelpDeskDeadlines(
  escalatedAt: Date,
  policy: HelpDeskSlaPolicy = DEFAULT_HELP_DESK_SLA,
) {
  const normalized = normalizeHelpDeskSlaPolicy(policy);
  return {
    firstResponseDueAt: addMinutes(escalatedAt, normalized.firstResponseMinutes),
    resolutionDueAt: addMinutes(escalatedAt, normalized.resolutionMinutes),
  };
}

type DateLike = Date | null;

export interface HelpDeskState {
  isResolved: boolean;
  needsHumanEscalation: boolean;
  escalatedAt: DateLike;
  escalationReason: string | null;
  assignedAgent: string | null;
  priority: string;
  handoffSequence: number;
  firstResponseDueAt: DateLike;
  resolutionDueAt: DateLike;
  firstHumanResponseAt: DateLike;
  lastHumanResponseAt: DateLike;
  resolvedAt: DateLike;
  reopenedAt: DateLike;
}

export type HelpDeskStatePatch = Partial<HelpDeskState>;
export interface HelpDeskTransition {
  changed: boolean;
  patch: HelpDeskStatePatch;
}

export function planHelpDeskEscalation(
  state: HelpDeskState,
  input: {
    at?: Date;
    reason?: string | null;
    assignedAgent?: string | null;
    priority?: unknown;
    sla?: unknown;
  } = {},
): HelpDeskTransition {
  if (state.needsHumanEscalation && !state.isResolved) return unchanged();
  const at = input.at || new Date();
  const deadlines = calculateHelpDeskDeadlines(at, normalizeHelpDeskSlaPolicy(input.sla));
  return {
    changed: true,
    patch: {
      isResolved: false,
      needsHumanEscalation: true,
      escalatedAt: at,
      escalationReason: cleanOptional(input.reason) || "Assistenza umana richiesta",
      assignedAgent: input.assignedAgent === undefined
        ? state.assignedAgent
        : cleanOptional(input.assignedAgent),
      priority: normalizeHelpDeskPriority(input.priority ?? state.priority),
      handoffSequence: Math.max(0, state.handoffSequence) + 1,
      ...deadlines,
      firstHumanResponseAt: null,
      lastHumanResponseAt: null,
      resolvedAt: null,
      reopenedAt: state.isResolved ? at : state.reopenedAt,
    },
  };
}

export function planHelpDeskReturnToBot(state: HelpDeskState): HelpDeskTransition {
  if (!state.needsHumanEscalation) return unchanged();
  return {
    changed: true,
    patch: {
      needsHumanEscalation: false,
      escalationReason: null,
      assignedAgent: null,
    },
  };
}

export function planHelpDeskResolution(
  state: HelpDeskState,
  at = new Date(),
): HelpDeskTransition {
  if (state.isResolved) return unchanged();
  return {
    changed: true,
    patch: {
      isResolved: true,
      resolvedAt: at,
      needsHumanEscalation: false,
      escalationReason: null,
      assignedAgent: null,
    },
  };
}

export function planHelpDeskReopen(
  state: HelpDeskState,
  at = new Date(),
): HelpDeskTransition {
  if (!state.isResolved) return unchanged();
  return {
    changed: true,
    patch: {
      isResolved: false,
      resolvedAt: null,
      reopenedAt: at,
      needsHumanEscalation: false,
      escalationReason: null,
      assignedAgent: null,
    },
  };
}

export function planHelpDeskOperatorReply(
  state: HelpDeskState,
  at = new Date(),
): HelpDeskTransition {
  if (!state.needsHumanEscalation || state.isResolved) return unchanged();
  return {
    changed: true,
    patch: {
      firstHumanResponseAt: earlierDate(state.firstHumanResponseAt, at),
      lastHumanResponseAt: laterDate(state.lastHumanResponseAt, at),
    },
  };
}

export function planHelpDeskPriorityChange(
  state: HelpDeskState,
  input: { priority: unknown; sla: unknown },
): HelpDeskTransition {
  const priority = normalizeHelpDeskPriority(input.priority);
  if (priority === state.priority) return unchanged();
  if (!state.escalatedAt) return { changed: true, patch: { priority } };

  const deadlines = calculateHelpDeskDeadlines(
    state.escalatedAt,
    normalizeHelpDeskSlaPolicy(input.sla),
  );
  return {
    changed: true,
    patch: {
      priority,
      // Completed targets are historical facts. A later priority change must
      // not move the deadline against which that completed target is measured.
      ...(state.firstHumanResponseAt ? {} : { firstResponseDueAt: deadlines.firstResponseDueAt }),
      ...(state.resolvedAt ? {} : { resolutionDueAt: deadlines.resolutionDueAt }),
    },
  };
}

export type HelpDeskSlaStatus = "not_applicable" | "pending" | "met" | "breached" | "cancelled";

export interface HelpDeskSlaAnalytics {
  firstResponseStatus: HelpDeskSlaStatus;
  resolutionStatus: HelpDeskSlaStatus;
  firstResponseDurationMs: number | null;
  resolutionDurationMs: number | null;
  firstResponseRemainingMs: number | null;
  resolutionRemainingMs: number | null;
}

export function buildHelpDeskEventMetadata(
  state: Pick<HelpDeskState,
    | "isResolved"
    | "needsHumanEscalation"
    | "escalatedAt"
    | "priority"
    | "handoffSequence"
    | "firstResponseDueAt"
    | "resolutionDueAt"
    | "firstHumanResponseAt"
    | "resolvedAt"
  >,
  occurredAt: Date,
  extra: Record<string, string | number | null> = {},
): Record<string, string | number | null> {
  const analytics = calculateHelpDeskSlaAnalytics(state, occurredAt);
  return {
    handoffSequence: state.handoffSequence,
    occurredAt: occurredAt.toISOString(),
    priority: normalizeHelpDeskPriority(state.priority),
    escalatedAt: isoOrNull(state.escalatedAt),
    firstResponseDueAt: isoOrNull(state.firstResponseDueAt),
    resolutionDueAt: isoOrNull(state.resolutionDueAt),
    firstHumanResponseAt: isoOrNull(state.firstHumanResponseAt),
    resolvedAt: isoOrNull(state.resolvedAt),
    firstResponseDurationMs: analytics.firstResponseDurationMs,
    resolutionDurationMs: analytics.resolutionDurationMs,
    needsHumanEscalation: state.needsHumanEscalation ? 1 : 0,
    isResolved: state.isResolved ? 1 : 0,
    ...extra,
  };
}

export function calculateHelpDeskSlaAnalytics(
  state: Pick<HelpDeskState,
    | "isResolved"
    | "needsHumanEscalation"
    | "escalatedAt"
    | "firstResponseDueAt"
    | "resolutionDueAt"
    | "firstHumanResponseAt"
    | "resolvedAt"
  >,
  now = new Date(),
): HelpDeskSlaAnalytics {
  if (!state.escalatedAt) {
    return {
      firstResponseStatus: "not_applicable",
      resolutionStatus: "not_applicable",
      firstResponseDurationMs: null,
      resolutionDurationMs: null,
      firstResponseRemainingMs: null,
      resolutionRemainingMs: null,
    };
  }

  const inactive = !state.needsHumanEscalation && !state.isResolved;
  const firstResponseStatus = state.firstHumanResponseAt
    ? compareToDeadline(state.firstHumanResponseAt, state.firstResponseDueAt)
    : inactive
      ? "cancelled"
      : pendingOrBreached(now, state.firstResponseDueAt);
  const resolutionStatus = state.resolvedAt
    ? compareToDeadline(state.resolvedAt, state.resolutionDueAt)
    : inactive
      ? "cancelled"
      : pendingOrBreached(now, state.resolutionDueAt);

  return {
    firstResponseStatus,
    resolutionStatus,
    firstResponseDurationMs: state.firstHumanResponseAt
      ? nonNegativeDuration(state.escalatedAt, state.firstHumanResponseAt)
      : null,
    resolutionDurationMs: state.resolvedAt
      ? nonNegativeDuration(state.escalatedAt, state.resolvedAt)
      : null,
    firstResponseRemainingMs: remainingMs(state.firstHumanResponseAt, state.firstResponseDueAt, now),
    resolutionRemainingMs: remainingMs(state.resolvedAt, state.resolutionDueAt, now),
  };
}

export async function escalateHelpDeskConversation(input: {
  botId: string;
  conversationId: string;
  at?: Date;
  reason?: string | null;
  assignedAgent?: string | null;
  priority?: unknown;
  sla?: unknown;
}) {
  const occurredAt = input.at || new Date();
  const current = await findConversation(input.botId, input.conversationId);
  if (!current) return null;
  const priority = normalizeHelpDeskPriority(input.priority ?? current.priority);
  let sla = input.sla;
  if (sla === undefined) {
    const chatbot = await prisma.chatbot.findUnique({ where: { id: input.botId }, select: { settings: true } });
    let settings: unknown = {};
    try { settings = JSON.parse(chatbot?.settings || "{}"); } catch {}
    sla = resolveHelpDeskSlaPolicy(settings, priority);
  }
  const transition = planHelpDeskEscalation(current, { ...input, at: occurredAt, priority, sla });
  if (!transition.changed) return { conversation: current, transitioned: false };
  const updated = await prisma.conversation.updateMany({
    where: {
      id: input.conversationId,
      botId: input.botId,
      handoffSequence: current.handoffSequence,
      OR: [{ needsHumanEscalation: false }, { isResolved: true }],
    },
    data: transition.patch as Prisma.ConversationUpdateManyMutationInput,
  });
  const conversation = await findConversation(input.botId, input.conversationId);
  if (updated.count === 1 && conversation) await recordHelpDeskEventBestEffort({
    botId: input.botId,
    conversationId: input.conversationId,
    eventType: "helpdesk.handoff_requested",
    occurredAt,
    metadata: buildHelpDeskEventMetadata(conversation, occurredAt),
  });
  return {
    conversation,
    transitioned: updated.count === 1,
  };
}

export async function returnHelpDeskConversationToBot(input: {
  botId: string;
  conversationId: string;
}) {
  const occurredAt = new Date();
  const current = await findConversation(input.botId, input.conversationId);
  if (!current) return null;
  const transition = planHelpDeskReturnToBot(current);
  if (!transition.changed) return { conversation: current, transitioned: false };
  const updated = await prisma.conversation.updateMany({
    where: {
      id: input.conversationId,
      botId: input.botId,
      needsHumanEscalation: true,
      handoffSequence: current.handoffSequence,
    },
    data: transition.patch as Prisma.ConversationUpdateManyMutationInput,
  });
  const conversation = await findConversation(input.botId, input.conversationId);
  if (updated.count === 1 && conversation) await recordHelpDeskEventBestEffort({
    botId: input.botId,
    conversationId: input.conversationId,
    eventType: "helpdesk.returned_to_bot",
    occurredAt,
    metadata: buildHelpDeskEventMetadata(conversation, occurredAt),
  });
  return {
    conversation,
    transitioned: updated.count === 1,
  };
}

export async function resolveHelpDeskConversation(input: {
  botId: string;
  conversationId: string;
  at?: Date;
}) {
  const occurredAt = input.at || new Date();
  const current = await findConversation(input.botId, input.conversationId);
  if (!current) return null;
  const transition = planHelpDeskResolution(current, occurredAt);
  if (!transition.changed) return { conversation: current, transitioned: false };
  const updated = await prisma.conversation.updateMany({
    where: {
      id: input.conversationId,
      botId: input.botId,
      isResolved: false,
      handoffSequence: current.handoffSequence,
    },
    data: transition.patch as Prisma.ConversationUpdateManyMutationInput,
  });
  const conversation = await findConversation(input.botId, input.conversationId);
  if (updated.count === 1 && conversation) await recordHelpDeskEventBestEffort({
    botId: input.botId,
    conversationId: input.conversationId,
    eventType: "helpdesk.resolved",
    occurredAt,
    metadata: buildHelpDeskEventMetadata(conversation, occurredAt),
  });
  return {
    conversation,
    transitioned: updated.count === 1,
  };
}

export async function reopenHelpDeskConversation(input: {
  botId: string;
  conversationId: string;
  at?: Date;
}) {
  const occurredAt = input.at || new Date();
  const current = await findConversation(input.botId, input.conversationId);
  if (!current) return null;
  const transition = planHelpDeskReopen(current, occurredAt);
  if (!transition.changed) return { conversation: current, transitioned: false };
  const updated = await prisma.conversation.updateMany({
    where: {
      id: input.conversationId,
      botId: input.botId,
      isResolved: true,
      handoffSequence: current.handoffSequence,
    },
    data: transition.patch as Prisma.ConversationUpdateManyMutationInput,
  });
  const conversation = await findConversation(input.botId, input.conversationId);
  if (updated.count === 1 && conversation) await recordHelpDeskEventBestEffort({
    botId: input.botId,
    conversationId: input.conversationId,
    eventType: "helpdesk.reopened",
    occurredAt,
    metadata: buildHelpDeskEventMetadata(conversation, occurredAt),
  });
  return {
    conversation,
    transitioned: updated.count === 1,
  };
}

export async function recordHelpDeskOperatorReply(input: {
  botId: string;
  conversationId: string;
  at?: Date;
}) {
  const at = input.at || new Date();
  const current = await findConversation(input.botId, input.conversationId);
  if (!current) return null;
  const changed = await prisma.$executeRaw`
    UPDATE "conversations"
    SET
      "firstHumanResponseAt" = LEAST(COALESCE("firstHumanResponseAt", ${at}), ${at}),
      "lastHumanResponseAt" = GREATEST(COALESCE("lastHumanResponseAt", ${at}), ${at})
    WHERE "id" = ${input.conversationId}
      AND "botId" = ${input.botId}
      AND "needsHumanEscalation" = true
      AND "isResolved" = false
      AND "handoffSequence" = ${current.handoffSequence}
  `;
  const conversation = await findConversation(input.botId, input.conversationId);
  if (changed === 1 && conversation) await recordHelpDeskEventBestEffort({
    botId: input.botId,
    conversationId: input.conversationId,
    eventType: "helpdesk.operator_replied",
    occurredAt: at,
    metadata: buildHelpDeskEventMetadata(conversation, at),
  });
  return {
    conversation,
    transitioned: changed === 1,
  };
}

export async function setHelpDeskPriority(input: {
  botId: string;
  conversationId: string;
  priority: unknown;
  at?: Date;
}) {
  const occurredAt = input.at || new Date();
  const current = await findConversation(input.botId, input.conversationId);
  if (!current) return null;
  const priority = normalizeHelpDeskPriority(input.priority);
  if (priority === current.priority) return { conversation: current, transitioned: false };
  const chatbot = await prisma.chatbot.findUnique({ where: { id: input.botId }, select: { settings: true } });
  let settings: unknown = {};
  try { settings = JSON.parse(chatbot?.settings || "{}"); } catch {}
  const transition = planHelpDeskPriorityChange(current, {
    priority,
    sla: resolveHelpDeskSlaPolicy(settings, priority),
  });
  const updated = await prisma.conversation.updateMany({
    where: {
      id: input.conversationId,
      botId: input.botId,
      priority: current.priority,
      handoffSequence: current.handoffSequence,
    },
    data: transition.patch as Prisma.ConversationUpdateManyMutationInput,
  });
  const conversation = await findConversation(input.botId, input.conversationId);
  if (updated.count === 1 && conversation) await recordHelpDeskEventBestEffort({
    botId: input.botId,
    conversationId: input.conversationId,
    eventType: "helpdesk.priority_changed",
    occurredAt,
    metadata: buildHelpDeskEventMetadata(conversation, occurredAt, {
      previousPriority: normalizeHelpDeskPriority(current.priority),
    }),
  });
  return {
    conversation,
    transitioned: updated.count === 1,
  };
}

export async function assignHelpDeskConversation(input: {
  botId: string;
  conversationId: string;
  assignedAgent: string | null;
}) {
  const occurredAt = new Date();
  const assignedAgent = cleanOptional(input.assignedAgent);
  const current = await findConversation(input.botId, input.conversationId);
  if (!current) return null;
  if (current.assignedAgent === assignedAgent) return { conversation: current, transitioned: false };
  const updated = await prisma.conversation.updateMany({
    where: {
      id: input.conversationId,
      botId: input.botId,
      assignedAgent: current.assignedAgent,
      handoffSequence: current.handoffSequence,
    },
    data: { assignedAgent },
  });
  const conversation = await findConversation(input.botId, input.conversationId);
  if (updated.count === 1 && conversation) await recordHelpDeskEventBestEffort({
    botId: input.botId,
    conversationId: input.conversationId,
    eventType: "helpdesk.assigned",
    occurredAt,
    metadata: buildHelpDeskEventMetadata(conversation, occurredAt, {
      assigned: assignedAgent ? 1 : 0,
    }),
  });
  return {
    conversation,
    transitioned: updated.count === 1,
  };
}

function boundedMinutes(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(numeric)
    ? Math.min(MAX_SLA_MINUTES, Math.max(1, Math.trunc(numeric)))
    : fallback;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

function cleanOptional(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned || null;
}

function unchanged(): HelpDeskTransition {
  return { changed: false, patch: {} };
}

function earlierDate(current: DateLike, candidate: Date) {
  return !current || candidate < current ? candidate : current;
}

function laterDate(current: DateLike, candidate: Date) {
  return !current || candidate > current ? candidate : current;
}

function compareToDeadline(value: Date, dueAt: DateLike): HelpDeskSlaStatus {
  return dueAt && value > dueAt ? "breached" : "met";
}

function pendingOrBreached(now: Date, dueAt: DateLike): HelpDeskSlaStatus {
  return dueAt && now > dueAt ? "breached" : "pending";
}

function nonNegativeDuration(from: Date, to: Date) {
  return Math.max(0, to.getTime() - from.getTime());
}

function remainingMs(completedAt: DateLike, dueAt: DateLike, now: Date) {
  if (completedAt || !dueAt) return null;
  return dueAt.getTime() - now.getTime();
}

function isoOrNull(value: DateLike) {
  return value?.toISOString() || null;
}

function findConversation(botId: string, conversationId: string): Promise<Conversation | null> {
  return prisma.conversation.findFirst({ where: { id: conversationId, botId } });
}

export interface HelpDeskEventInput {
  botId: string;
  conversationId: string;
  eventType: string;
  occurredAt: Date;
  metadata: Record<string, string | number | null>;
}

interface HelpDeskEventDependencies {
  create?: (data: Prisma.EventCreateInput) => Promise<unknown>;
  log?: (entry: Record<string, string | number>) => void;
}

export async function recordHelpDeskEventBestEffort(
  input: HelpDeskEventInput,
  dependencies: HelpDeskEventDependencies = {},
) {
  const data: Prisma.EventCreateInput = {
    chatbot: { connect: { id: input.botId } },
    conversation: { connect: { id: input.conversationId } },
    eventType: input.eventType,
    category: "conversation",
    severity: "info",
    timestamp: input.occurredAt,
    metadata: JSON.stringify(input.metadata),
  };
  try {
    const create = dependencies.create || ((event) => prisma.event.create({ data: event }));
    await create(data);
    return true;
  } catch (error) {
    const entry = {
      component: "helpdesk_event_recorder",
      outcome: "record_failed",
      eventType: input.eventType,
      botId: input.botId,
      conversationId: input.conversationId,
      handoffSequence: Number(input.metadata.handoffSequence) || 0,
      errorType: error instanceof Error ? error.name : "UnknownError",
    };
    if (dependencies.log) dependencies.log(entry);
    else console.error(JSON.stringify(entry));
    return false;
  }
}
