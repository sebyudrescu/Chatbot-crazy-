import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeDraft, serializeMessage } from "@/lib/backstage-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.backstageSession.findUnique({
    where: { id },
    include: { chatbot: { select: { id: true, companyName: true } }, messages: { orderBy: { createdAt: "asc" } }, drafts: { orderBy: { createdAt: "desc" } } },
  });
  if (!session) return NextResponse.json({ success: false, error: "Sessione non trovata" }, { status: 404 });
  return NextResponse.json({ success: true, data: { ...session, messages: session.messages.map(serializeMessage), drafts: session.drafts.map(serializeDraft) } });
}

