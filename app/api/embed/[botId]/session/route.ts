import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import { createWidgetSession } from "@/lib/widget-session";
import { isAllowedWidgetOrigin } from "@/lib/widget-origin";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ botId: string }> },
) {
  const { botId } = await props.params;
  if (!z.string().uuid().safeParse(botId).success) {
    return NextResponse.json({ success: false, error: "Agente non valido" }, { status: 400 });
  }
  if (!request.headers.get("origin") && process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: "origin_required" }, { status: 403 });
  }
  if (!await isAllowedWidgetOrigin(botId, request.headers.get("origin"), request.nextUrl.origin)) {
    return NextResponse.json({ success: false, error: "origin_not_allowed" }, { status: 403 });
  }
  const rate = await checkRateLimit(
    `widget-session:${botId}:${requestClientIp(request.headers)}`,
    20,
    60 * 1000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limit_exceeded" },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } },
    );
  }

  const agent = await prisma.chatbot.findUnique({
    where: { id: botId },
    select: { isActive: true, embedSettings: { select: { enabled: true } } },
  });
  if (!agent?.isActive || !agent.embedSettings?.enabled) {
    return NextResponse.json({ success: false, error: "agent_not_published" }, { status: 403 });
  }

  try {
    return NextResponse.json({ success: true, data: createWidgetSession(botId) });
  } catch (error) {
    console.error("[WidgetSession] Unable to create signed session", error);
    return NextResponse.json(
      { success: false, error: "widget_session_not_configured" },
      { status: 503 },
    );
  }
}
