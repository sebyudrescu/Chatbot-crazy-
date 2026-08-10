import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BackstageSessionCreateSchema } from "@/lib/backstage-contract";
import { serializeDraft, serializeMessage } from "@/lib/backstage-service";

function serialize(session: any) {
  return { ...session, messages: session.messages?.map(serializeMessage), drafts: session.drafts?.map(serializeDraft) };
}

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get("botId");
  if (!botId) return NextResponse.json({ success: false, error: "botId obbligatorio" }, { status: 400 });
  const sessions = await prisma.backstageSession.findMany({
    where: { botId }, orderBy: { updatedAt: "desc" }, take: 50,
    include: { _count: { select: { messages: true, drafts: true } } },
  });
  return NextResponse.json({ success: true, data: sessions });
}

export async function POST(request: NextRequest) {
  try {
    const input = BackstageSessionCreateSchema.parse(await request.json());
    const bot = await prisma.chatbot.findUnique({ where: { id: input.botId }, select: { id: true, companyName: true } });
    if (!bot) return NextResponse.json({ success: false, error: "Agente non trovato" }, { status: 404 });
    const session = await prisma.backstageSession.create({
      data: { botId: input.botId, title: input.title || `Analisi ${bot.companyName}` },
      include: { messages: true, drafts: true },
    });
    return NextResponse.json({ success: true, data: serialize(session) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Sessione non valida" }, { status: 400 });
  }
}

