import "server-only";
import { prisma } from "./db";

export async function syncCRMContactFromConversation(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { _count: { select: { messages: true } } },
  });
  if (!conversation) throw new Error("Conversazione non trovata");

  const identityKey =
    conversation.userEmail?.toLowerCase() ||
    conversation.userPhone?.replace(/\s/g, "") ||
    conversation.userSessionId;
  let leadScore = 10;
  if (conversation.userEmail) leadScore += 25;
  if (conversation.userPhone) leadScore += 20;
  if (conversation.userCompany) leadScore += 15;
  if (
    conversation.userIntent &&
    /sales|quote|preventivo|purchase/i.test(conversation.userIntent)
  )
    leadScore += 15;
  if (conversation.needsHumanEscalation) leadScore += 5;

  return prisma.cRMContact.upsert({
    where: {
      botId_identityKey: { botId: conversation.botId, identityKey },
    },
    create: {
      botId: conversation.botId,
      identityKey,
      name: conversation.userName,
      email: conversation.userEmail,
      phone: conversation.userPhone,
      company: conversation.userCompany,
      source: "widget",
      leadScore: Math.min(100, leadScore),
      lastConversationId: conversation.id,
      lastInteraction:
        conversation.lastMessageAt || conversation.startedAt,
    },
    update: {
      name: conversation.userName || undefined,
      email: conversation.userEmail || undefined,
      phone: conversation.userPhone || undefined,
      company: conversation.userCompany || undefined,
      leadScore: Math.min(100, leadScore),
      lastConversationId: conversation.id,
      lastInteraction:
        conversation.lastMessageAt || conversation.startedAt,
    },
  });
}
