import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import {
  executeWidgetServerFunction,
  WidgetFunctionAlreadyFailedError,
  WidgetFunctionInProgressError,
} from "@/lib/widget-function-runtime";
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from "@/lib/workspace-auth";

const PayloadSchema = z.object({
  invocationId: z.string().uuid().optional(),
  data: z.record(z.unknown()).default({}),
  state: z.record(z.unknown()).default({}),
  context: z.object({
    conversationId: z.string().uuid().optional(),
    botId: z.string().uuid().optional(),
  }).default({}),
});

export async function POST(
  request: NextRequest,
  route: { params: Promise<{ id: string; functionId: string }> },
) {
  if (Number(request.headers.get("content-length") || 0) > 100_000) {
    return NextResponse.json({ success: false, error: "Payload troppo grande" }, { status: 413 });
  }
  const { id, functionId } = await route.params;
  try {
    const actor = await requireDashboardActor(request);
    await requireResourcePermission(actor, "action", id, "chatbot.write");
    const payload = PayloadSchema.parse(await request.json());
    const rate = await checkRateLimit(
      `owner-widget-function:${id}:${functionId}:${requestClientIp(request.headers)}`,
      20,
      60_000,
    );
    if (!rate.allowed) return NextResponse.json({ success: false, error: "Limite funzione raggiunto" }, { status: 429 });
    const data = await executeWidgetServerFunction({
      actionId: id,
      functionId,
      payload,
      idempotencyKey: `owner-widget:${id}:${functionId}:${payload.invocationId || crypto.randomUUID()}`,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
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
