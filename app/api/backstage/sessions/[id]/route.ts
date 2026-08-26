import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeDraft, serializeMessage } from "@/lib/backstage-service";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "backstageSession", id, "chatbot.read");
    const session = await prisma.backstageSession.findUnique({
      where: { id },
      include: { chatbot: { select: { id: true, companyName: true } }, messages: { orderBy: { createdAt: "asc" } }, drafts: { orderBy: { createdAt: "desc" } } },
    });
    if (!session) return NextResponse.json({ success: false, error: "Sessione non trovata" }, { status: 404 });
    return NextResponse.json({ success: true, data: { ...session, messages: session.messages.map(serializeMessage), drafts: session.drafts.map(serializeDraft) } });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: "Sessione non disponibile" }, { status: 400 });
  }
}
