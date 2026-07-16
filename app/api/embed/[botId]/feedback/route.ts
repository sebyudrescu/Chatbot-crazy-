import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAllowedWidgetOrigin } from "@/lib/widget-origin";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";

const FeedbackSchema = z.object({
  messageId: z.string().uuid(),
  feedback: z.enum(["positive", "negative"]),
  feedbackComment: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ botId: string }> },
) {
  const { botId } = await props.params;
  const parsedBotId = z.string().uuid().safeParse(botId);
  const parsed = FeedbackSchema.safeParse(await request.json());
  if (!parsedBotId.success || !parsed.success) {
    return NextResponse.json(
      { success: false, error: "Feedback non valido" },
      { status: 400 },
    );
  }

  if (
    !(await isAllowedWidgetOrigin(
      botId,
      request.headers.get("origin"),
      request.nextUrl.origin,
    ))
  ) {
    return NextResponse.json(
      { success: false, error: "origin_not_allowed" },
      { status: 403 },
    );
  }

  const rate = checkRateLimit(
    `widget-feedback:${botId}:${requestClientIp(request.headers)}`,
    30,
    60 * 1000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limit_exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const updated = await prisma.message.updateMany({
    where: {
      id: parsed.data.messageId,
      role: "assistant",
      conversation: { botId },
    },
    data: {
      feedback: parsed.data.feedback,
      feedbackComment: parsed.data.feedbackComment || null,
    },
  });
  if (!updated.count) {
    return NextResponse.json(
      { success: false, error: "Messaggio non trovato" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
