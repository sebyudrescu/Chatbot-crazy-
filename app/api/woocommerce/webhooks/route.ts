import { after, NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseWooCommerceConfig } from "@/lib/woocommerce-auth";
import { verifyWooCommerceWebhookHmac } from "@/lib/woocommerce-signatures";
import { processWooCommerceWebhook } from "@/lib/woocommerce-webhooks";
import { runCommerceSyncWorker } from "@/lib/commerce-sync-worker";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let source: string;
  try { source = new URL(request.headers.get("x-wc-webhook-source") || "").origin; }
  catch { return NextResponse.json({ success: false, error: "Sorgente WooCommerce mancante" }, { status: 400 }); }
  const topic = (request.headers.get("x-wc-webhook-topic") || "").toLowerCase();
  const connection = await prisma.integrationConnection.findFirst({ where: { provider: "woocommerce", externalAccountId: source, enabled: true } });
  if (!connection) return NextResponse.json({ success: true, ignored: true });
  const config = parseWooCommerceConfig(connection.config);
  if (!config.webhookSecret || !verifyWooCommerceWebhookHmac(rawBody, request.headers.get("x-wc-webhook-signature"), config.webhookSecret)) {
    return NextResponse.json({ success: false, error: "Firma WooCommerce non valida" }, { status: 401 });
  }
  const deliveryId = request.headers.get("x-wc-webhook-delivery-id") || request.headers.get("x-wc-webhook-id") || createHash("sha256").update(`${source}:${topic}:${rawBody}`).digest("hex");
  const externalId = `woocommerce:${source}:${deliveryId}`;
  const existing = await prisma.commerceWebhookDelivery.findUnique({ where: { externalId } });
  if (existing?.status === "processed") return NextResponse.json({ success: true, duplicate: true });
  try {
    if (existing) await prisma.commerceWebhookDelivery.update({ where: { id: existing.id }, data: { status: "processing", error: null } });
    else await prisma.commerceWebhookDelivery.create({ data: { botId: connection.botId, provider: "woocommerce", externalId, topic, status: "processing" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ success: true, duplicate: true });
    throw error;
  }
  try {
    const payload = JSON.parse(rawBody);
    const result = await processWooCommerceWebhook(connection, topic, payload);
    await prisma.commerceWebhookDelivery.update({ where: { externalId }, data: { status: "processed", processedAt: new Date() } });
    if ("jobId" in result && typeof result.jobId === "string") {
      after(() => runCommerceSyncWorker(result.jobId));
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook WooCommerce non elaborato";
    await prisma.commerceWebhookDelivery.update({ where: { externalId }, data: { status: "failed", error: message.slice(0, 1000) } });
    return NextResponse.json({ success: false, error: "Elaborazione temporaneamente non riuscita" }, { status: 500 });
  }
}
