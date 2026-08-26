import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

const parse = (value: string | null) => {
  try {
    return JSON.parse(value || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
};

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
  const { id } = await props.params;
  const actor = await requireDashboardActor(request);
  await requireResourcePermission(actor, "integration", id, "chatbot.read");
  const connection = await prisma.integrationConnection.findUnique({
    where: { id },
    select: { id: true, botId: true, provider: true },
  });
  if (!connection) {
    return NextResponse.json(
      { success: false, error: "Connessione non trovata" },
      { status: 404 },
    );
  }
  const events = await prisma.event.findMany({
    where: {
      botId: connection.botId,
      eventType: {
        in: ["integration.webhook.delivered", "integration.webhook.failed"],
      },
    },
    orderBy: { timestamp: "desc" },
    take: 100,
  });
  const deliveries = events
    .map((event) => ({ event, metadata: parse(event.metadata) }))
    .filter((item) => item.metadata.integrationId === id)
    .slice(0, 20)
    .map(({ event, metadata }) => ({
      id: event.id,
      event: metadata.event,
      success: event.success,
      status: metadata.status,
      attempts: metadata.attempts,
      durationMs: event.durationMs,
      error: event.errorMessage,
      createdAt: event.timestamp,
    }));
  return NextResponse.json({ success: true, data: deliveries });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: "Consegne non disponibili" }, { status: 500 });
  }
}
