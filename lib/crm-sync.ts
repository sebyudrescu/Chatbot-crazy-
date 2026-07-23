import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export type CRMConsentStatus = "unknown" | "granted" | "denied";

export function normalizeCRMEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

export function normalizeCRMPhone(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function latestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    return !latest || value > latest ? value : latest;
  }, null);
}

export async function syncCRMContactFromConversation(
  conversationId: string,
  options: { consentStatus?: CRMConsentStatus } = {},
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new Error("Conversazione non trovata");

  const email = normalizeCRMEmail(conversation.userEmail);
  const phone = normalizeCRMPhone(conversation.userPhone);
  const identityKey = email || phone || conversation.userSessionId;

  const related = await prisma.conversation.findMany({
    where: {
      botId: conversation.botId,
      OR: [
        { userSessionId: conversation.userSessionId },
        ...(email ? [{ userEmail: { equals: email, mode: Prisma.QueryMode.insensitive } }] : []),
        ...(conversation.userPhone ? [{ userPhone: conversation.userPhone }] : []),
        ...(phone && phone !== conversation.userPhone ? [{ userPhone: phone }] : []),
      ],
    },
    include: { _count: { select: { messages: true } } },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { startedAt: "desc" }],
  });

  const identities = [...new Set([
    identityKey,
    conversation.userSessionId,
    email,
    phone,
    conversation.userEmail,
    conversation.userPhone,
  ].filter((value): value is string => Boolean(value)))];

  const candidates = await prisma.cRMContact.findMany({
    where: {
      botId: conversation.botId,
      OR: [
        { identityKey: { in: identities } },
        { lastConversationId: { in: related.map(item => item.id) } },
        ...(email ? [{ email: { equals: email, mode: Prisma.QueryMode.insensitive } }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const latest = related[0] || conversation;
  const intents = related.map(item => item.userIntent).filter(Boolean) as string[];
  const messageCount = related.reduce((sum, item) => sum + item._count.messages, 0);
  let leadScore = 10;
  if (email) leadScore += 25;
  if (phone) leadScore += 20;
  if (latest.userCompany) leadScore += 15;
  if (intents.some(intent => /sales|quote|preventivo|purchase|acquist|prezzo/i.test(intent))) leadScore += 15;
  if (related.length > 1) leadScore += 10;
  if (messageCount >= 5) leadScore += 5;
  if (messageCount >= 10) leadScore += 5;
  if (related.some(item => item.needsHumanEscalation)) leadScore += 5;
  leadScore = Math.min(100, leadScore);

  const canonical = candidates.find(item => item.identityKey === identityKey) || candidates[0];
  const duplicateIds = candidates.filter(item => item.id !== canonical?.id).map(item => item.id);
  const tags = [...new Set(candidates.flatMap(item => parseList(item.tags)).filter((item): item is string => typeof item === "string"))];
  const notes = candidates.flatMap(item => parseList(item.notes));
  const bestStage = candidates.find(item => item.stage !== "new")?.stage || canonical?.stage || "new";
  const bestValue = candidates.reduce<number | null>((value, item) => {
    if (item.potentialValue === null) return value;
    return value === null ? item.potentialValue : Math.max(value, item.potentialValue);
  }, null);
  const existingConsent = candidates.find(item => item.consentStatus !== "unknown")?.consentStatus || "unknown";

  return prisma.$transaction(async tx => {
    if (duplicateIds.length) {
      await tx.cRMContact.deleteMany({ where: { id: { in: duplicateIds } } });
    }
    const data = {
      identityKey,
      name: latest.userName || canonical?.name || null,
      email: email || normalizeCRMEmail(canonical?.email),
      phone: phone || normalizeCRMPhone(canonical?.phone),
      company: latest.userCompany || canonical?.company || null,
      source: latest.channel || canonical?.source || "chat",
      stage: bestStage,
      leadScore: Math.max(leadScore, ...candidates.map(item => item.leadScore), 0),
      potentialValue: bestValue,
      tags: JSON.stringify(tags),
      notes: JSON.stringify(notes),
      consentStatus: options.consentStatus || existingConsent,
      lastConversationId: latest.id,
      lastInteraction: latestDate(related.map(item => item.lastMessageAt || item.startedAt)) || new Date(),
    };
    if (canonical) {
      return tx.cRMContact.update({ where: { id: canonical.id }, data });
    }
    return tx.cRMContact.create({ data: { botId: conversation.botId, ...data } });
  });
}
