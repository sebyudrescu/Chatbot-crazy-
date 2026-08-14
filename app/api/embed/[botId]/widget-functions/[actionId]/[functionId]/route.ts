import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAllowedWidgetOrigin } from "@/lib/widget-origin";
import { readWidgetSession, widgetSessionToken } from "@/lib/widget-session";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import {
  executeWidgetServerFunction,
  WidgetFunctionAlreadyFailedError,
  WidgetFunctionInProgressError,
} from "@/lib/widget-function-runtime";

const PayloadSchema = z.object({
  invocationId: z.string().uuid(),
  userSessionId: z.string().min(1).max(300),
  conversationId: z.string().uuid(),
  data: z.record(z.unknown()).default({}),
  state: z.record(z.unknown()).default({}),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  route: { params: Promise<{ botId: string; actionId: string; functionId: string }> },
) {
  if (Number(request.headers.get("content-length") || 0) > 100_000) {
    return NextResponse.json({ success: false, error: "Payload troppo grande" }, { status: 413 });
  }
  const { botId, actionId, functionId } = await route.params;
  try {
    const payload = PayloadSchema.parse(await request.json());
    if (!request.headers.get("origin") && process.env.NODE_ENV === "production") {
      return NextResponse.json({ success: false, error: "origin_required" }, { status: 403 });
    }
    if (!(await isAllowedWidgetOrigin(botId, request.headers.get("origin"), request.nextUrl.origin))) {
      return NextResponse.json({ success: false, error: "origin_not_allowed" }, { status: 403 });
    }
    try {
      readWidgetSession(widgetSessionToken(request), botId, payload.userSessionId);
    } catch {
      return NextResponse.json({ success: false, error: "widget_session_invalid" }, { status: 401 });
    }
    const [action, conversation] = await Promise.all([
      prisma.agentAction.findFirst({ where: { id: actionId, botId, enabled: true }, select: { id: true } }),
      prisma.conversation.findFirst({ where: { id: payload.conversationId, botId, userSessionId: payload.userSessionId }, select: { id: true } }),
    ]);
    if (!action || !conversation) {
      return NextResponse.json({ success: false, error: "widget_context_invalid" }, { status: 404 });
    }
    const rate = await checkRateLimit(
      `embed-widget-function:${botId}:${actionId}:${requestClientIp(request.headers)}`,
      20,
      60_000,
    );
    if (!rate.allowed) return NextResponse.json({ success: false, error: "rate_limit_exceeded" }, { status: 429 });
    const data = await executeWidgetServerFunction({
      actionId,
      functionId,
      payload: {
        data: payload.data,
        state: payload.state,
        context: { botId, conversationId: conversation.id },
      },
      idempotencyKey: `embed-widget:${actionId}:${functionId}:${payload.invocationId}`,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const status = error instanceof WidgetFunctionInProgressError
      ? 409
      : error instanceof WidgetFunctionAlreadyFailedError
        ? 422
        : 400;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Funzione non riuscita" },
      { status },
    );
  }
}
