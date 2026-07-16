import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseJSON } from "@/lib/utils";

const SearchSchema = z.object({
  botId: z.string().uuid(),
  matchBy: z.enum(["email", "phone", "session"]),
  query: z.string().trim().min(3).max(300),
});

const DeleteSchema = SearchSchema.extend({
  confirmation: z.literal("ELIMINA"),
});

const normalizePhone = (value: string) => value.replace(/\D/g, "");
const normalizeEmail = (value: string) => value.trim().toLowerCase();

function matches(
  item: { userEmail?: string | null; userPhone?: string | null; userSessionId?: string | null },
  matchBy: z.infer<typeof SearchSchema>["matchBy"],
  query: string,
) {
  if (matchBy === "email") return normalizeEmail(item.userEmail || "") === normalizeEmail(query);
  if (matchBy === "phone") return normalizePhone(item.userPhone || "") === normalizePhone(query);
  return item.userSessionId === query;
}

async function findVisitorData(input: z.infer<typeof SearchSchema>) {
  const [chatbot, conversationCandidates] = await Promise.all([
    prisma.chatbot.findUnique({
      where: { id: input.botId },
      select: { id: true, companyName: true },
    }),
    prisma.conversation.findMany({
      where: {
        botId: input.botId,
        ...(input.matchBy === "email"
          ? { userEmail: { equals: input.query, mode: "insensitive" as const } }
          : input.matchBy === "session"
            ? { userSessionId: input.query }
            : { userPhone: { not: null } }),
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        structuredFacts: { orderBy: { extractedAt: "asc" } },
      },
      orderBy: { startedAt: "asc" },
    }),
  ]);
  if (!chatbot) return null;

  const conversations = conversationCandidates.filter((item) =>
    matches(item, input.matchBy, input.query),
  );
  const conversationIds = new Set(conversations.map((item) => item.id));
  const knownEmails = new Set(
    conversations
      .map((item) => item.userEmail && normalizeEmail(item.userEmail))
      .filter((value): value is string => Boolean(value)),
  );
  const knownPhones = new Set(
    conversations
      .map((item) => item.userPhone && normalizePhone(item.userPhone))
      .filter((value): value is string => Boolean(value)),
  );
  const knownSessions = new Set(conversations.map((item) => item.userSessionId));
  const contactCandidates = await prisma.cRMContact.findMany({
    where: { botId: input.botId },
    orderBy: { createdAt: "asc" },
  });
  const contacts = contactCandidates.filter(
    (item) =>
      matches(
        {
          userEmail: item.email,
          userPhone: item.phone,
          userSessionId: item.identityKey,
        },
        input.matchBy,
        input.query,
      ) ||
      (item.lastConversationId ? conversationIds.has(item.lastConversationId) : false) ||
      knownEmails.has(normalizeEmail(item.email || item.identityKey)) ||
      knownPhones.has(normalizePhone(item.phone || item.identityKey)) ||
      knownSessions.has(item.identityKey),
  );

  return {
    chatbot,
    subject: { matchedBy: input.matchBy, value: input.query },
    generatedAt: new Date().toISOString(),
    counts: {
      conversations: conversations.length,
      messages: conversations.reduce((total, item) => total + item.messages.length, 0),
      structuredFacts: conversations.reduce(
        (total, item) => total + item.structuredFacts.length,
        0,
      ),
      crmContacts: contacts.length,
    },
    conversations: conversations.map((conversation) => ({
      ...conversation,
      tags: parseJSON<string[]>(conversation.tags) || [],
      extractedData: parseJSON(conversation.extractedData),
      topicsDiscussed: parseJSON(conversation.topicsDiscussed),
      messages: conversation.messages.map((message) => ({
        ...message,
        sourcesUsed: parseJSON(message.sourcesUsed),
        ctaData: parseJSON(message.ctaData),
        quickReplies: parseJSON(message.quickReplies),
      })),
      structuredFacts: conversation.structuredFacts.map((fact) => ({
        ...fact,
        supersedes: parseJSON(fact.supersedes),
        metadata: parseJSON(fact.metadata),
        embedding: undefined,
      })),
    })),
    crmContacts: contacts.map((contact) => ({
      ...contact,
      tags: parseJSON<string[]>(contact.tags) || [],
      notes: parseJSON(contact.notes) || [],
    })),
  };
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest) {
  try {
    const input = SearchSchema.parse({
      botId: request.nextUrl.searchParams.get("botId"),
      matchBy: request.nextUrl.searchParams.get("matchBy"),
      query: request.nextUrl.searchParams.get("query"),
    });
    const data = await findVisitorData(input);
    if (!data) return noStoreJson({ success: false, error: "Agente non trovato" }, 404);

    if (request.nextUrl.searchParams.get("download") === "1") {
      const safeDate = new Date().toISOString().slice(0, 10);
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="dati-visitatore-${safeDate}.json"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return noStoreJson({ success: true, data });
  } catch (error) {
    return noStoreJson(
      {
        success: false,
        error: error instanceof z.ZodError
          ? "Seleziona un agente e inserisci un identificativo valido"
          : "Ricerca dei dati non riuscita",
      },
      400,
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const input = DeleteSchema.parse(await request.json());
    const data = await findVisitorData(input);
    if (!data) return noStoreJson({ success: false, error: "Agente non trovato" }, 404);
    const conversationIds = data.conversations.map((item) => item.id);
    const contactIds = data.crmContacts.map((item) => item.id);

    const [contacts, conversations] = await prisma.$transaction([
      prisma.cRMContact.deleteMany({ where: { id: { in: contactIds } } }),
      prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } }),
    ]);

    return noStoreJson({
      success: true,
      data: {
        deletedConversations: conversations.count,
        deletedContacts: contacts.count,
        deletedMessages: data.counts.messages,
        deletedStructuredFacts: data.counts.structuredFacts,
      },
    });
  } catch (error) {
    return noStoreJson(
      {
        success: false,
        error: error instanceof z.ZodError
          ? "Conferma non valida: digita ELIMINA"
          : "Cancellazione dei dati non riuscita",
      },
      400,
    );
  }
}
