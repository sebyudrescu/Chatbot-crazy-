import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAllowedWidgetOrigin } from "@/lib/widget-origin";
import { readWidgetSession, widgetSessionToken } from "@/lib/widget-session";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";

const eventSchema = z.object({
  eventType: z.enum(["click", "compare", "add_to_cart"]),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  userSessionId: z.string().min(1).max(300),
  pageUrl: z.string().url().max(2048).optional(),
});

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
  const origin = request.headers.get("origin");
  if (!origin && process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: "origin_required" }, { status: 403 });
  }
  if (!(await isAllowedWidgetOrigin(botId, origin, request.nextUrl.origin))) {
    return NextResponse.json({ success: false, error: "origin_not_allowed" }, { status: 403 });
  }
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Evento non valido" }, { status: 400 });
  }
  const input = parsed.data;
  try {
    readWidgetSession(widgetSessionToken(request), botId, input.userSessionId);
  } catch {
    return NextResponse.json({ success: false, error: "widget_session_invalid" }, { status: 401 });
  }
  const rate = await checkRateLimit(
    `widget-commerce:${botId}:${requestClientIp(request.headers)}`,
    60,
    60 * 1000,
  );
  if (!rate.allowed) {
    return NextResponse.json({ success: false, error: "rate_limit_exceeded" }, { status: 429 });
  }

  const [conversation, message, product, variant] = await Promise.all([
    prisma.conversation.findFirst({
      where: { id: input.conversationId, botId, userSessionId: input.userSessionId },
      select: { id: true },
    }),
    prisma.message.findFirst({
      where: { id: input.messageId, conversationId: input.conversationId, role: "assistant" },
      select: { id: true, productCards: true },
    }),
    prisma.product.findFirst({ where: { id: input.productId, botId }, select: { id: true } }),
    input.variantId
      ? prisma.productVariant.findFirst({
          where: { id: input.variantId, productId: input.productId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!conversation || !message || !product || (input.variantId && !variant)) {
    return NextResponse.json({ success: false, error: "Evento non autorizzato" }, { status: 404 });
  }
  const cards = (() => {
    try { return JSON.parse(message.productCards || "[]"); }
    catch { return []; }
  })();
  if (!Array.isArray(cards) || !cards.some((card) => card?.productId === input.productId && (!input.variantId || card?.variantId === input.variantId))) {
    return NextResponse.json({ success: false, error: "Prodotto non mostrato nel messaggio" }, { status: 403 });
  }
  let pageUrl: string | undefined;
  try {
    if (input.pageUrl && origin && new URL(input.pageUrl).origin === new URL(origin).origin) pageUrl = input.pageUrl;
  } catch {}

  await prisma.commerceEvent.create({
    data: {
      botId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      productId: input.productId,
      variantId: input.variantId,
      eventType: input.eventType,
      sessionId: input.userSessionId,
      pageUrl,
    },
  });
  return NextResponse.json({ success: true });
}
