import "server-only";

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { IntegrationConnection } from "@prisma/client";
import { prisma } from "./db";
import { persistExtractedProducts } from "./commerce-importer";
import { safeHttpsUrl } from "./commerce-types";
import type { ExtractedProduct } from "./product-extractor";
import { ensureShopifyAccessToken, SHOPIFY_API_VERSION, shopifyEnvironment } from "./shopify-auth";
import { normalizeShopDomain } from "./shopify-signatures";

const TOPICS = ["PRODUCTS_CREATE", "PRODUCTS_UPDATE", "PRODUCTS_DELETE", "APP_UNINSTALLED"] as const;

function identity(provider: string, value: string) {
  return `${provider}:${createHash("sha256").update(value).digest("hex")}`;
}

function plainText(value: unknown) {
  if (typeof value !== "string") return "";
  return cheerio.load(value).text().replace(/\s+/g, " ").trim();
}

async function shopifyGraphql(shop: string, token: string, query: string, variables: Record<string, unknown>) {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || payload?.errors?.length) {
    throw new Error(payload?.errors?.[0]?.message || `Shopify GraphQL HTTP ${response.status}`);
  }
  return payload?.data;
}

export async function registerShopifyWebhooks(connection: IntegrationConnection) {
  const environment = shopifyEnvironment();
  if (!environment.ready) throw new Error("Configurazione Shopify della piattaforma incompleta");
  const { token, config } = await ensureShopifyAccessToken(connection);
  const shop = normalizeShopDomain(String(config.shopDomain || config.shopUrl || ""));
  if (!shop) throw new Error("Dominio Shopify non valido");
  const current = await shopifyGraphql(shop, token, `query CurrentWebhooks {
    webhookSubscriptions(first: 100) { nodes { topic uri } }
  }`, {});
  const installed = new Set((current?.webhookSubscriptions?.nodes || [])
    .filter((item: any) => item.uri === environment.webhookUrl)
    .map((item: any) => String(item.topic)));
  const mutation = `mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }) {
      webhookSubscription { id topic }
      userErrors { field message }
    }
  }`;
  await Promise.all(TOPICS.filter((topic) => !installed.has(topic)).map(async (topic) => {
    const data = await shopifyGraphql(shop, token, mutation, { topic, callbackUrl: environment.webhookUrl });
    const errors = data?.webhookSubscriptionCreate?.userErrors || [];
    const blocking = errors.filter((error: any) => !/already|taken|exists/i.test(String(error.message || "")));
    if (blocking.length) throw new Error(blocking.map((error: any) => error.message).join("; "));
  }));
}

function webhookProduct(payload: any, shop: string): ExtractedProduct | null {
  const rawId = payload?.admin_graphql_api_id || (payload?.id ? `gid://shopify/Product/${payload.id}` : "");
  const canonicalUrl = safeHttpsUrl(payload?.online_store_url)
    ?? safeHttpsUrl(payload?.handle ? `https://${shop}/products/${payload.handle}` : undefined);
  if (!rawId || !canonicalUrl || !payload?.title) return null;
  const rawTags = Array.isArray(payload.tags)
    ? payload.tags
    : String(payload.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const images = (payload.images || []).map((image: any) => safeHttpsUrl(image?.src)).filter(Boolean) as string[];
  const variants = (payload.variants || []).map((variant: any, index: number) => {
    const externalId = variant.admin_graphql_api_id || (variant.id ? `gid://shopify/ProductVariant/${variant.id}` : String(index));
    const stock = Number.isFinite(Number(variant.inventory_quantity)) ? Number(variant.inventory_quantity) : undefined;
    return {
      identityKey: identity("shopify-variant", externalId),
      externalId,
      sku: variant.sku || undefined,
      title: variant.title || undefined,
      price: Number.isFinite(Number(variant.price)) ? Number(variant.price) : undefined,
      compareAtPrice: Number.isFinite(Number(variant.compare_at_price)) ? Number(variant.compare_at_price) : undefined,
      currency: payload.currency || undefined,
      available: stock === undefined || stock > 0 || variant.inventory_policy === "continue",
      stockQuantity: stock,
      productUrl: canonicalUrl,
      imageUrl: safeHttpsUrl(variant.image?.src),
      attributes: Object.fromEntries([1, 2, 3].flatMap((position) => {
        const name = payload.options?.find((option: any) => Number(option.position) === position)?.name;
        const value = variant[`option${position}`];
        return name && value ? [[String(name), String(value)]] : [];
      })),
      position: index,
    };
  });
  return {
    identityKey: identity("shopify", rawId),
    externalId: rawId,
    canonicalUrl,
    title: payload.title,
    description: plainText(payload.body_html),
    brand: payload.vendor || undefined,
    productType: payload.product_type || undefined,
    categories: payload.product_type ? [payload.product_type] : [],
    tags: rawTags,
    mainImageUrl: safeHttpsUrl(payload.image?.src) ?? images[0],
    imageUrls: images,
    availableForSale: String(payload.status || "active").toLowerCase() === "active" && variants.some((variant: { available: boolean }) => variant.available),
    variants,
    metadata: { source: "shopify-webhook" },
  };
}

export async function processShopifyWebhook(
  connection: IntegrationConnection,
  topic: string,
  payload: any,
) {
  const shop = normalizeShopDomain(connection.externalAccountId || "");
  if (!shop) throw new Error("Connessione Shopify senza dominio verificato");
  if (topic === "app/uninstalled") {
    await prisma.$transaction([
      prisma.integrationConnection.update({ where: { id: connection.id }, data: { enabled: false, status: "disconnected", lastError: "App rimossa dal negozio Shopify" } }),
      prisma.productSource.updateMany({ where: { botId: connection.botId, sourceType: "shopify" }, data: { status: "disconnected", syncEnabled: false } }),
    ]);
    return { uninstalled: true };
  }
  if (topic === "products/delete") {
    const externalId = payload?.admin_graphql_api_id || (payload?.id ? `gid://shopify/Product/${payload.id}` : "");
    if (!externalId) return { deleted: 0 };
    const result = await prisma.product.updateMany({
      where: { botId: connection.botId, externalId },
      data: { status: "deleted", availableForSale: false, lastSyncedAt: new Date() },
    });
    return { deleted: result.count };
  }
  if (topic === "products/create" || topic === "products/update") {
    const product = webhookProduct(payload, shop);
    if (!product) throw new Error("Payload prodotto Shopify incompleto");
    return persistExtractedProducts(connection.botId, `https://${shop}`, [product], {
      sourceType: "shopify",
      sourceName: `Shopify: ${shop}`,
    });
  }
  return { ignored: true };
}
