import "server-only";
import { prisma } from "@/lib/db";
import { parseJSON } from "@/lib/utils";

export const DEFAULT_RETENTION_DAYS = 365;

type AgentRetention = {
  id: string;
  companyName: string;
  settings: string | null;
};

function retentionDays(agent: AgentRetention) {
  const settings = parseJSON<Record<string, unknown>>(agent.settings) || {};
  const value = Number(settings.dataRetentionDays);
  return Number.isInteger(value) && value >= 30 && value <= 3650
    ? value
    : DEFAULT_RETENTION_DAYS;
}

function expiredConversationWhere(botId: string, cutoff: Date) {
  return {
    botId,
    OR: [
      { lastMessageAt: { lt: cutoff } },
      { lastMessageAt: null, startedAt: { lt: cutoff } },
    ],
  };
}

export async function getRetentionPreview(botId?: string) {
  const agents = await prisma.chatbot.findMany({
    where: botId ? { id: botId } : undefined,
    select: { id: true, companyName: true, settings: true },
    orderBy: { companyName: "asc" },
  });

  return Promise.all(
    agents.map(async (agent) => {
      const days = retentionDays(agent);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const [conversations, crmContacts] = await Promise.all([
        prisma.conversation.count({
          where: expiredConversationWhere(agent.id, cutoff),
        }),
        prisma.cRMContact.count({
          where: { botId: agent.id, lastInteraction: { lt: cutoff } },
        }),
      ]);
      return {
        botId: agent.id,
        companyName: agent.companyName,
        retentionDays: days,
        cutoff: cutoff.toISOString(),
        expiredConversations: conversations,
        expiredContacts: crmContacts,
      };
    }),
  );
}

export async function cleanupExpiredData(botId?: string) {
  const previews = await getRetentionPreview(botId);
  const results = [];

  for (const preview of previews) {
    const cutoff = new Date(preview.cutoff);
    const conversations = await prisma.conversation.findMany({
      where: expiredConversationWhere(preview.botId, cutoff),
      select: { id: true },
    });
    const conversationIds = conversations.map((item) => item.id);

    const deleted = await prisma.$transaction(async (tx) => {
      const [workflowExecutions, actionExecutions, evaluationRuns, usageEvents] =
        await Promise.all([
          tx.workflowExecution.deleteMany({
            where: { conversationId: { in: conversationIds } },
          }),
          tx.actionExecution.deleteMany({
            where: { conversationId: { in: conversationIds } },
          }),
          tx.evaluationRun.deleteMany({
            where: { conversationId: { in: conversationIds } },
          }),
          tx.aIUsageEvent.deleteMany({
            where: { conversationId: { in: conversationIds } },
          }),
        ]);
      const crmContacts = await tx.cRMContact.deleteMany({
        where: { botId: preview.botId, lastInteraction: { lt: cutoff } },
      });
      const removedConversations = await tx.conversation.deleteMany({
        where: { id: { in: conversationIds } },
      });
      return {
        conversations: removedConversations.count,
        crmContacts: crmContacts.count,
        workflowExecutions: workflowExecutions.count,
        actionExecutions: actionExecutions.count,
        evaluationRuns: evaluationRuns.count,
        usageEvents: usageEvents.count,
      };
    });

    results.push({
      botId: preview.botId,
      companyName: preview.companyName,
      retentionDays: preview.retentionDays,
      cutoff: preview.cutoff,
      deleted,
    });
  }

  return {
    executedAt: new Date().toISOString(),
    agents: results,
    totals: results.reduce(
      (totals, item) => ({
        conversations: totals.conversations + item.deleted.conversations,
        crmContacts: totals.crmContacts + item.deleted.crmContacts,
        linkedRecords:
          totals.linkedRecords +
          item.deleted.workflowExecutions +
          item.deleted.actionExecutions +
          item.deleted.evaluationRuns +
          item.deleted.usageEvents,
      }),
      { conversations: 0, crmContacts: 0, linkedRecords: 0 },
    ),
  };
}
