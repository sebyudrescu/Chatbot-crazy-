import "server-only";

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { IntegrationConnection } from "@prisma/client";
import { prisma } from "./db";
import { persistExtractedProducts } from "./commerce-importer";
import { safeHttpsUrl } from "./commerce-types";
import type { ExtractedProduct } from "./product-extractor";

function identity(provider: string, value: string) {
  return `${provider}:${createHash("sha256").update(value).digest("hex")}`;
}

function plainText(value: unknown) {
  if (typeof value !== "string") return "";
  return cheerio.load(value).text().replace(/\s+/g, " ").trim();
}

function productFromWebhook(payload: any): ExtractedProduct | null {
  const externalId = payload?.id ? String(payload.id) : "";
  const canonicalUrl = safeHttpsUrl(payload?.permalink);
  if (!externalId || !canonicalUrl || !payload?.name) return null;
  const images = (payload.images || []).map((image: any) => safeHttpsUrl(image?.src)).filter(Boolean) as string[];
  const price = Number(payload.price);
  const regularPrice = Number(payload.regular_price);
  const stock = Number.isFinite(Number(payload.stock_quantity)) ? Number(payload.stock_quantity) : undefined;
  const available = payload.purchasable !== false && ["instock", "onbackorder"].includes(String(payload.stock_status || "instock"));
  return {
    identityKey: identity("woocommerce", externalId),
    externalId,
    canonicalUrl,
    title: payload.name,
    description: plainText(payload.short_description || payload.description),
    brand: payload.brands?.[0]?.name || undefined,
    productType: payload.type || undefined,
    categories: (payload.categories || []).map((category: any) => category.name).filter(Boolean),
    tags: (payload.tags || []).map((tag: any) => tag.name).filter(Boolean),
    mainImageUrl: images[0],
    imageUrls: images,
    availableForSale: available,
    variants: [{
      identityKey: identity("woocommerce-variant", externalId),
      externalId,
      sku: payload.sku || undefined,
      title: payload.name,
      price: Number.isFinite(price) ? price : undefined,
      compareAtPrice: Number.isFinite(regularPrice) && regularPrice > price ? regularPrice : undefined,
      currency: payload.currency || undefined,
      available,
      stockQuantity: stock,
      productUrl: canonicalUrl,
      imageUrl: images[0],
      attributes: {},
    }],
    metadata: { source: "woocommerce-webhook" },
  };
}

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
    const product = productFromWebhook(payload);
    if (!product) throw new Error("Payload prodotto WooCommerce incompleto");
    return persistExtractedProducts(connection.botId, connection.externalAccountId || "", [product], { sourceType: "woocommerce", sourceName: `WooCommerce: ${new URL(connection.externalAccountId || product.canonicalUrl).hostname}` });
  }
  if (topic === "order.created" || topic === "order.updated") return processOrder(connection, topic, payload);
  return { ignored: true };
}
