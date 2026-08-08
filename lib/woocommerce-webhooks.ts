import "server-only";

import type { IntegrationConnection } from "@prisma/client";
import { prisma } from "./db";
import { enqueueCommerceSync } from "./commerce-sync-queue";

function orderMeta(payload: any, key: string) {
  const item = (payload?.meta_data || []).find((meta: any) => meta?.key === key);
  return typeof item?.value === "string" ? item.value.slice(0, 300) : undefined;
}

async function processOrder(connection: IntegrationConnection, topic: string, payload: any) {
  if (!payload?.id) throw new Error("Ordine WooCommerce senza ID");
  const status = String(payload.status || "").toLowerCase();
  const eventType = topic === "order.created"
    ? "checkout"
    : ["processing", "completed"].includes(status) ? "conversion" : null;
  if (!eventType) return { ignored: true };
  const currency = /^[A-Z]{3}$/.test(String(payload.currency || "")) ? String(payload.currency) : undefined;
  if (eventType === "conversion" && !currency) throw new Error("Valuta ordine WooCommerce non valida");
  const conversationCandidate = orderMeta(payload, "litx_conversation_id");
  const conversation = conversationCandidate
    ? await prisma.conversation.findFirst({ where: { id: conversationCandidate, botId: connection.botId }, select: { id: true } })
    : null;
  const lineItems = Array.isArray(payload.line_items) && payload.line_items.length ? payload.line_items : [null];
  const externalIds = lineItems.flatMap((item: any) => item?.product_id ? [String(item.product_id)] : []);
  const products = externalIds.length
    ? await prisma.product.findMany({ where: { botId: connection.botId, externalId: { in: externalIds } }, select: { id: true, externalId: true } })
    : [];
  const productByExternalId = new Map(products.map((product) => [product.externalId, product.id]));
  const rows = lineItems.map((item: any, index: number) => {
    const lineValue = Number(item?.total);
    const orderValue = Number(payload.total);
    return {
      botId: connection.botId,
      conversationId: conversation?.id,
      productId: item?.product_id ? productByExternalId.get(String(item.product_id)) : undefined,
      eventType,
      externalEventId: `woocommerce:${connection.id}:order:${payload.id}:${eventType}:${item?.id || index}`,
      sessionId: orderMeta(payload, "litx_session_id"),
      value: Number.isFinite(lineValue) ? lineValue : Number.isFinite(orderValue) ? orderValue : undefined,
      currency,
      metadata: JSON.stringify({ verified: true, source: "woocommerce-webhook", orderStatus: status }),
    };
  });
  const result = await prisma.commerceEvent.createMany({ data: rows, skipDuplicates: true });
  return { recorded: result.count, eventType };
}

export async function processWooCommerceWebhook(
  connection: IntegrationConnection,
  topic: string,
  payload: any,
) {
  if (topic === "product.deleted") {
    const externalId = payload?.id ? String(payload.id) : "";
    if (!externalId) return { deleted: 0 };
    const result = await prisma.product.updateMany({ where: { botId: connection.botId, externalId }, data: { status: "deleted", availableForSale: false, lastSyncedAt: new Date() } });
    return { deleted: result.count };
  }
  if (topic === "product.created" || topic === "product.updated") {
    if (!payload?.id) throw new Error("Payload prodotto WooCommerce incompleto");
    const { job, reused } = await enqueueCommerceSync(connection.botId, "woocommerce");
    return { queued: true, jobId: job.id, reused };
  }
  if (topic === "order.created" || topic === "order.updated") return processOrder(connection, topic, payload);
  return { ignored: true };
}
