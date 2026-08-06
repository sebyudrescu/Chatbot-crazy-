import "server-only";

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { prisma } from "./db";
import { assertSafeRemoteUrl } from "./url-safety";
import { persistExtractedProducts } from "./commerce-importer";
import { safeHttpsUrl } from "./commerce-types";
import type { ExtractedProduct } from "./product-extractor";
import { ensureShopifyAccessToken } from "./shopify-auth";
import { decryptConfigSecrets } from "./secret-config";

function identity(provider: string, value: string) {
  return `${provider}:${createHash("sha256").update(value).digest("hex")}`;
}

function plainText(html: unknown) {
  if (typeof html !== "string") return "";
  return cheerio.load(html).text().replace(/\s+/g, " ").trim();
}

const SHOPIFY_VARIANT_FIELDS = `
  id title sku price compareAtPrice availableForSale inventoryQuantity
  selectedOptions { name value }
  image { url }
`;

async function shopifyGraphql(
  endpoint: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json().catch(() => null) as any;
    const throttled = response.status === 429 || payload?.errors?.some((error: any) => error?.extensions?.code === "THROTTLED");
    if (throttled && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1_000, 2_000)
        : 500 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (!response.ok || payload?.errors?.length || !payload?.data) {
      throw new Error(payload?.errors?.[0]?.message || `Shopify API HTTP ${response.status}`);
    }
    return payload.data;
  }
  throw new Error("Shopify API non disponibile dopo i tentativi previsti");
}

async function completeShopifyVariants(
  endpoint: string,
  token: string,
  productId: string,
  initial: { nodes?: any[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } },
) {
  const nodes = [...(initial?.nodes || [])];
  let pageInfo = initial?.pageInfo;
  const query = `query ProductVariants($id: ID!, $cursor: String) {
    product(id: $id) {
      variants(first: 100, after: $cursor) {
        nodes { ${SHOPIFY_VARIANT_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;
  for (let page = 1; page < 21 && pageInfo?.hasNextPage; page += 1) {
    if (!pageInfo.endCursor) throw new Error(`Paginazione varianti Shopify non valida per ${productId}`);
    const data = await shopifyGraphql(endpoint, token, query, { id: productId, cursor: pageInfo.endCursor });
    const variants = data.product?.variants;
    if (!variants) throw new Error(`Prodotto Shopify ${productId} non disponibile durante la sincronizzazione`);
    nodes.push(...(variants.nodes || []));
    pageInfo = variants.pageInfo;
  }
  if (pageInfo?.hasNextPage) {
    throw new Error(`Il prodotto Shopify ${productId} supera il limite supportato di 2.100 varianti`);
  }
  return nodes;
}

interface CommerceSyncOptions {
  jobId?: string;
  jobAttempt?: number;
  onProgress?: (progress: number, message: string) => Promise<void>;
}

async function syncShopify(
  connection: Awaited<ReturnType<typeof prisma.integrationConnection.findUnique>>,
  options: CommerceSyncOptions,
) {
  if (!connection) throw new Error("Connessione Shopify non trovata");
  const botId = connection.botId;
  const { token, config } = await ensureShopifyAccessToken(connection);
  const shop = await assertSafeRemoteUrl(config.shopUrl || "");
  const apiVersion = /^20\d{2}-(01|04|07|10)$/.test(String(config.apiVersion || "")) ? String(config.apiVersion) : "2026-07";
  const endpoint = new URL(`/admin/api/${apiVersion}/graphql.json`, shop.origin).toString();
  await options.onProgress?.(8, "Connessione Shopify verificata");
  const query = `query Catalog($cursor: String) {
    shop { currencyCode }
    products(first: 100, after: $cursor, query: "status:active") {
      nodes {
        id title description vendor productType tags handle status onlineStoreUrl
        featuredMedia { preview { image { url } } }
        media(first: 10) { nodes { preview { image { url } } } }
        variants(first: 100) {
          nodes { ${SHOPIFY_VARIANT_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;
  const products: ExtractedProduct[] = [];
  let cursor: string | null = null;
  let completedSnapshot = false;
  for (let page = 0; page < 10; page += 1) {
    const data = await shopifyGraphql(endpoint, token, query, { cursor });
    if (!data.products) throw new Error("Shopify API non ha restituito il catalogo prodotti");
    for (const item of data.products.nodes as any[]) {
      const canonicalUrl = safeHttpsUrl(item.onlineStoreUrl);
      if (!canonicalUrl) continue;
      const images = (item.media?.nodes || []).map((node: any) => safeHttpsUrl(node?.preview?.image?.url)).filter(Boolean);
      const variantNodes = await completeShopifyVariants(endpoint, token, item.id, item.variants || {});
      const variants = variantNodes.map((variant: any, index: number) => ({
        identityKey: identity("shopify-variant", variant.id),
        externalId: variant.id,
        sku: variant.sku || undefined,
        title: variant.title || undefined,
        price: Number.isFinite(Number(variant.price)) ? Number(variant.price) : undefined,
        compareAtPrice: variant.compareAtPrice != null && Number.isFinite(Number(variant.compareAtPrice)) ? Number(variant.compareAtPrice) : undefined,
        currency: data.shop?.currencyCode || undefined,
        available: Boolean(variant.availableForSale),
        stockQuantity: Number.isFinite(Number(variant.inventoryQuantity)) ? Number(variant.inventoryQuantity) : undefined,
        productUrl: canonicalUrl,
        imageUrl: safeHttpsUrl(variant.image?.url),
        attributes: Object.fromEntries((variant.selectedOptions || []).map((option: any) => [String(option.name), String(option.value)])),
        position: index,
      }));
      products.push({
        identityKey: identity("shopify", item.id), externalId: item.id, canonicalUrl, title: item.title,
        description: item.description || "", brand: item.vendor || undefined, productType: item.productType || undefined, tags: item.tags || [],
        categories: item.productType ? [item.productType] : [], mainImageUrl: safeHttpsUrl(item.featuredMedia?.preview?.image?.url) ?? images[0],
        imageUrls: images, availableForSale: item.status === "ACTIVE" && variants.some((variant: any) => variant.available), variants,
        metadata: { source: "shopify", tags: item.tags || [] },
      });
    }
    await options.onProgress?.(Math.min(45, 15 + ((page + 1) * 3)), `Letti ${products.length} prodotti da Shopify`);
    if (!data.products.pageInfo.hasNextPage) {
      completedSnapshot = true;
      break;
    }
    cursor = data.products.pageInfo.endCursor;
  }
  if (!completedSnapshot) {
    throw new Error("Catalogo Shopify oltre 1.000 prodotti: sincronizzazione interrotta per evitare uno snapshot parziale");
  }
  return persistExtractedProducts(botId, shop.origin, products, {
    sourceType: "shopify",
    sourceName: `Shopify: ${shop.hostname}`,
    reconcileVariants: true,
    authoritativeSnapshot: true,
    jobId: options.jobId,
    jobAttempt: options.jobAttempt,
    onProgress: options.onProgress,
  });
}

async function syncWooCommerce(botId: string, config: Record<string, string>, options: CommerceSyncOptions) {
  const store = await assertSafeRemoteUrl(config.storeUrl || "");
  const products: ExtractedProduct[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const endpoint = new URL(`/wp-json/wc/store/v1/products?per_page=100&page=${page}`, store.origin);
    const response = await fetch(endpoint, { redirect: "error", signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`WooCommerce Store API HTTP ${response.status}`);
    const items = await response.json() as any[];
    if (!Array.isArray(items)) throw new Error("Risposta WooCommerce non valida");
    for (const item of items) {
      const canonicalUrl = safeHttpsUrl(item.permalink);
      if (!canonicalUrl || !item.name) continue;
      const minorUnit = Number.isInteger(item.prices?.currency_minor_unit) ? item.prices.currency_minor_unit : 2;
      const divisor = 10 ** minorUnit;
      const rawPrice = Number(item.prices?.price);
      const rawRegular = Number(item.prices?.regular_price);
      const images = (item.images || []).map((image: any) => safeHttpsUrl(image?.src)).filter(Boolean);
      const variant = {
        identityKey: identity("woocommerce-variant", String(item.id)), externalId: String(item.id), sku: item.sku || undefined,
        title: item.name, price: Number.isFinite(rawPrice) ? rawPrice / divisor : undefined,
        compareAtPrice: Number.isFinite(rawRegular) && rawRegular > rawPrice ? rawRegular / divisor : undefined,
        currency: item.prices?.currency_code || undefined, available: Boolean(item.is_in_stock), productUrl: canonicalUrl,
        imageUrl: images[0], attributes: {},
      };
      products.push({
        identityKey: identity("woocommerce", String(item.id)), externalId: String(item.id), canonicalUrl, title: item.name,
        description: plainText(item.short_description || item.description), brand: item.brands?.[0]?.name || undefined,
        productType: item.type || undefined, categories: (item.categories || []).map((category: any) => category.name).filter(Boolean), tags: (item.tags || []).map((tag: any) => tag.name).filter(Boolean),
        mainImageUrl: images[0], imageUrls: images, availableForSale: Boolean(item.is_purchasable && item.is_in_stock),
        variants: [variant], metadata: { source: "woocommerce", averageRating: item.average_rating },
      });
    }
    const totalPages = Number(response.headers.get("x-wp-totalpages") || page);
    await options.onProgress?.(Math.min(45, 15 + (page * 3)), `Letti ${products.length} prodotti da WooCommerce`);
    if (page >= totalPages || items.length === 0) break;
  }
  return persistExtractedProducts(botId, store.origin, products, {
    sourceType: "woocommerce",
    sourceName: `WooCommerce: ${store.hostname}`,
    authoritativeSnapshot: true,
    jobId: options.jobId,
    jobAttempt: options.jobAttempt,
    onProgress: options.onProgress,
  });
}

export async function syncCommercePlatform(
  botId: string,
  provider: "shopify" | "woocommerce",
  options: CommerceSyncOptions = {},
) {
  const connection = await prisma.integrationConnection.findUnique({ where: { botId_provider: { botId, provider } } });
  if (!connection?.enabled) throw new Error(`${provider} non è collegato o è disattivato`);
  try {
    const result = provider === "shopify"
      ? await syncShopify(connection, options)
      : await syncWooCommerce(botId, decryptConfigSecrets(JSON.parse(connection.config)) as Record<string, string>, options);
    await prisma.integrationConnection.update({ where: { id: connection.id }, data: { status: "connected", lastTestedAt: new Date(), lastError: null } });
    return result;
  } catch (error) {
    await prisma.integrationConnection.update({ where: { id: connection.id }, data: { status: "error", lastTestedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 1000) : "Sync fallita" } });
    throw error;
  }
}
