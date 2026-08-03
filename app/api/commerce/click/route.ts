import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import { commerceClickEnvironment } from "@/lib/commerce-click-links";
import { verifyCommerceClickToken } from "@/lib/commerce-click-signatures";
import { safeHttpsUrl } from "@/lib/commerce-types";

export async function GET(request: NextRequest) {
  const environment = commerceClickEnvironment();
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!environment || token.length > 2000) return NextResponse.redirect(new URL("/", request.url), 302);
  const payload = verifyCommerceClickToken(token, environment.secret);
  if (!payload) return NextResponse.redirect(new URL("/", request.url), 302);

  const [product, conversation, message] = await Promise.all([
    prisma.product.findFirst({ where: { id: payload.p, botId: payload.b, status: "active" }, select: { id: true, canonicalUrl: true } }),
    payload.c ? prisma.conversation.findFirst({ where: { id: payload.c, botId: payload.b }, select: { id: true, userSessionId: true } }) : null,
    payload.m && payload.c ? prisma.message.findFirst({ where: { id: payload.m, conversationId: payload.c }, select: { id: true } }) : null,
  ]);
  const destination = safeHttpsUrl(product?.canonicalUrl);
  if (!product || !destination || (payload.c && !conversation) || (payload.m && !message)) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  const fingerprint = createHash("sha256").update(`${token}:${requestClientIp(request.headers)}`).digest("hex");
  const limit = await checkRateLimit(`commerce-click:${fingerprint}`, 10, 24 * 60 * 60_000);
  if (limit.allowed) {
    await prisma.commerceEvent.create({
      data: {
        botId: payload.b,
        conversationId: conversation?.id,
        messageId: message?.id,
        productId: product.id,
        eventType: "click",
        sessionId: conversation?.userSessionId,
        pageUrl: destination,
        metadata: JSON.stringify({ verified: true, source: "meta-tracked-link" }),
      },
    }).catch(() => undefined);
  }
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
