import "server-only";

import type { IntegrationConnection } from "@prisma/client";
import { prisma } from "./db";
import { enqueueCommerceSync } from "./commerce-sync-queue";
import { resolveCommerceAttribution } from "./commerce-attribution";
import { buildWooCommerceOrderEvents } from "./woocommerce-order-events";

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
  const orderValue = Number(payload.total);
  if (eventType === "conversion" && (!currency || !Number.isFinite(orderValue) || orderValue < 0)) {
    throw new Error("Valore o valuta ordine WooCommerce non validi");
  }
  const conversationCandidate = orderMeta(payload, "litx_conversation_id");
  const sessionCandidate = orderMeta(payload, "litx_session_id");
  const attribution = await resolveCommerceAttribution({
    botId: connection.botId,
    conversationId: conversationCandidate,
    sessionId: sessionCandidate,
  });
  const lineItems = Array.isArray(payload.line_items) && payload.line_items.length ? payload.line_items : [null];
  const externalIds = lineItems.flatMap((item: any) => item?.product_id ? [String(item.product_id)] : []);
  const products = externalIds.length
    ? await prisma.product.findMany({ where: { botId: connection.botId, externalId: { in: externalIds } }, select: { id: true, externalId: true } })
    : [];
  const productByExternalId = new Map(products.map((product) => [product.externalId, product.id]));
  const variationIds = lineItems.flatMap((item: any) => item?.variation_id ? [String(item.variation_id)] : []);
  const variants = products.length && variationIds.length
    ? await prisma.productVariant.findMany({
        where: { productId: { in: products.map((product) => product.id) }, externalId: { in: variationIds } },
        select: { id: true, productId: true, externalId: true },
      })
    : [];
  const variantByProductAndExternalId = new Map(variants.map((variant) => [`${variant.productId}:${variant.externalId}`, variant.id]));
  const resolvedLineItems = lineItems.flatMap((item: any, index: number) => {
    if (!item) return [];
    const lineValue = Number(item?.total);
    const productId = item?.product_id ? productByExternalId.get(String(item.product_id)) : undefined;
    return [{
      id: String(item?.id || index),
      index,
      productId,
      variantId: productId && item?.variation_id
        ? variantByProductAndExternalId.get(`${productId}:${String(item.variation_id)}`)
        : undefined,
      value: Number.isFinite(lineValue) && lineValue >= 0 ? lineValue : undefined,
    }];
  });
  const rows = buildWooCommerceOrderEvents({
    botId: connection.botId,
    connectionId: connection.id,
    orderId: String(payload.id),
    eventType,
    value: Number.isFinite(orderValue) && orderValue >= 0 ? orderValue : undefined,
    currency,
    status,
    attribution,
    lineItems: resolvedLineItems,
  });
  const result = await prisma.commerceEvent.createMany({ data: rows, skipDuplicates: true });
  return { recorded: result.count, eventType, lineItemsRecorded: resolvedLineItems.length };
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
