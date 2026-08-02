import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { shopifyEnvironment } from "@/lib/shopify-auth";
import { normalizeShopDomain, verifyShopifyWebhookHmac } from "@/lib/shopify-signatures";
import { processShopifyWebhook } from "@/lib/shopify-webhooks";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const environment = shopifyEnvironment();
  if (!environment.clientSecret || !verifyShopifyWebhookHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"), environment.clientSecret)) {
    return NextResponse.json({ success: false, error: "Firma Shopify non valida" }, { status: 401 });
  }
  const shop = normalizeShopDomain(request.headers.get("x-shopify-shop-domain") || "");
  const topic = (request.headers.get("x-shopify-topic") || "").toLowerCase();
  const webhookId = request.headers.get("x-shopify-webhook-id")
    || createHash("sha256").update(`${shop}:${topic}:${rawBody}`).digest("hex");
  if (!shop || !topic) return NextResponse.json({ success: false, error: "Header Shopify mancanti" }, { status: 400 });
  const connection = await prisma.integrationConnection.findFirst({
    where: { provider: "shopify", externalAccountId: shop },
  });
  if (!connection) return NextResponse.json({ success: true, ignored: true });
  const existing = await prisma.commerceWebhookDelivery.findUnique({ where: { externalId: webhookId } });
  if (existing?.status === "processed") return NextResponse.json({ success: true, duplicate: true });
  try {
    if (existing) {
      await prisma.commerceWebhookDelivery.update({ where: { id: existing.id }, data: { status: "processing", error: null } });
    } else {
      await prisma.commerceWebhookDelivery.create({ data: { botId: connection.botId, provider: "shopify", externalId: webhookId, topic, status: "processing" } });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ success: true, duplicate: true });
    throw error;
  }
  try {
    const payload = JSON.parse(rawBody);
    const result = await processShopifyWebhook(connection, topic, payload);
    await prisma.commerceWebhookDelivery.update({ where: { externalId: webhookId }, data: { status: "processed", processedAt: new Date() } });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook Shopify non elaborato";
    await prisma.commerceWebhookDelivery.update({ where: { externalId: webhookId }, data: { status: "failed", error: message.slice(0, 1000) } });
    return NextResponse.json({ success: false, error: "Elaborazione temporaneamente non riuscita" }, { status: 500 });
  }
}
