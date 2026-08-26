import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCRMEmail, normalizeCRMPhone } from "@/lib/crm-sync";
import { accessibleBotIds, dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from "@/lib/workspace-auth";

const parse = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export async function GET(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    const botId = request.nextUrl.searchParams.get("botId");
    if (botId) await requireBotPermission(actor, botId, "chatbot.read");
    const ids = botId ? null : await accessibleBotIds(actor, "chatbot.read");
    const where = botId ? { botId } : ids === null ? undefined : { botId: { in: ids } };
    const [contacts, conversations] = await Promise.all([
      prisma.cRMContact.findMany({
        where,
        include: { chatbot: { select: { id: true, companyName: true } } },
        orderBy: { lastInteraction: "desc" },
      }),
      prisma.conversation.findMany({
        where,
        include: { _count: { select: { messages: true } } },
      }),
    ]);

    const conversationById = new Map(conversations.map(item => [item.id, item]));
    const contactByAlias = new Map<string, string>();
    for (const contact of contacts) {
      const lastConversation = contact.lastConversationId
        ? conversationById.get(contact.lastConversationId)
        : undefined;
      const aliases = [
        contact.identityKey,
        normalizeCRMEmail(contact.email),
        normalizeCRMPhone(contact.phone),
        lastConversation?.userSessionId,
      ].filter((value): value is string => Boolean(value));
      for (const alias of aliases) contactByAlias.set(`${contact.botId}:${alias}`, contact.id);
    }

    const metrics = new Map<string, {
      conversationCount: number;
      messageCount: number;
      intents: Set<string>;
      needsAttention: boolean;
      resolvedCount: number;
    }>();
    for (const conversation of conversations) {
      const aliases = [
        normalizeCRMEmail(conversation.userEmail),
        normalizeCRMPhone(conversation.userPhone),
        conversation.userSessionId,
      ].filter((value): value is string => Boolean(value));
      const contactId = aliases
        .map(alias => contactByAlias.get(`${conversation.botId}:${alias}`))
        .find(Boolean);
      if (!contactId) continue;
      const current = metrics.get(contactId) || {
        conversationCount: 0,
        messageCount: 0,
        intents: new Set<string>(),
        needsAttention: false,
        resolvedCount: 0,
      };
      current.conversationCount += 1;
      current.messageCount += conversation._count.messages;
      if (conversation.userIntent) current.intents.add(conversation.userIntent);
      current.needsAttention ||= conversation.needsHumanEscalation && !conversation.isResolved;
      if (conversation.isResolved) current.resolvedCount += 1;
      metrics.set(contactId, current);
    }

    return NextResponse.json({
      success: true,
      data: contacts.map(contact => {
        const item = metrics.get(contact.id);
        return {
          ...contact,
          tags: parse(contact.tags),
          notes: parse(contact.notes),
          conversationId: contact.lastConversationId,
          agent: contact.chatbot,
          conversationCount: item?.conversationCount || 0,
          messageCount: item?.messageCount || 0,
          intents: item ? [...item.intents] : [],
          needsAttention: item?.needsAttention || false,
          resolved: Boolean(item?.conversationCount && item.resolvedCount === item.conversationCount),
        };
      }),
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("Error fetching CRM contacts:", error);
    return NextResponse.json(
      { success: false, error: "Impossibile caricare i contatti CRM" },
      { status: 500 },
    );
  }
}
