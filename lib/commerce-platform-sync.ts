import "server-only";

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { prisma } from "./db";
import { assertSafeRemoteUrl } from "./url-safety";
import { finalizeAuthoritativeSnapshot, persistExtractedProducts } from "./commerce-importer";
import { safeHttpsUrl } from "./commerce-types";
import type { ExtractedProduct } from "./product-extractor";
import { ensureShopifyAccessToken } from "./shopify-auth";
import { decryptConfigSecrets } from "./secret-config";
import { wooCommerceRequest, wooCommerceRequestWithMeta, type WooCommerceConnectionConfig } from "./woocommerce-auth";

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
const COMPLETED_SNAPSHOT_CHECKPOINT = "__snapshot_complete__";

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

async function mapShopifyProducts(
  endpoint: string,
  token: string,
  nodes: any[],
  currency?: string,
) {
  const products: ExtractedProduct[] = [];
  for (const item of nodes) {
    const canonicalUrl = safeHttpsUrl(item.onlineStoreUrl);
    if (!canonicalUrl) continue;
    const images = (item.media?.nodes || [])
      .map((node: any) => safeHttpsUrl(node?.preview?.image?.url))
      .filter((url: string | undefined): url is string => Boolean(url));
    const variantNodes = await completeShopifyVariants(endpoint, token, item.id, item.variants || {});
    const variants = variantNodes.map((variant: any, index: number) => ({
      identityKey: identity("shopify-variant", variant.id),
      externalId: variant.id,
      sku: variant.sku || undefined,
      title: variant.title || undefined,
      price: Number.isFinite(Number(variant.price)) ? Number(variant.price) : undefined,
      compareAtPrice: variant.compareAtPrice != null && Number.isFinite(Number(variant.compareAtPrice)) ? Number(variant.compareAtPrice) : undefined,
      currency: currency || undefined,
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
      imageUrls: images, availableForSale: item.status === "ACTIVE" && variants.some((variant) => variant.available), variants,
      metadata: { source: "shopify", tags: item.tags || [] },
    });
  }
  return products;
}

interface CommerceSyncOptions {
  jobId?: string;
  jobLeaseVersion?: number;
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
  const resumableJob = options.jobId ? await prisma.productSyncJob.findFirst({
    where: {
      id: options.jobId,
      botId,
      status: "running",
      ...(options.jobLeaseVersion !== undefined ? { leaseVersion: options.jobLeaseVersion } : {}),
    },
  }) : null;
  if (options.jobId && !resumableJob) throw new Error("Lease del job Shopify non valida");

  if (resumableJob) {
    if (resumableJob.checkpoint === COMPLETED_SNAPSHOT_CHECKPOINT) {
      await finalizeAuthoritativeSnapshot(botId, resumableJob.sourceId, resumableJob.snapshotStartedAt || resumableJob.startedAt || new Date());
      return {
        created: resumableJob.productsCreated,
        updated: resumableJob.productsUpdated,
        failed: resumableJob.productsFailed,
      };
    }
    let cursor = resumableJob.checkpoint;
    for (let invocationPage = 0; invocationPage < 3; invocationPage += 1) {
      const data = await shopifyGraphql(endpoint, token, query, { cursor });
      if (!data.products) throw new Error("Shopify API non ha restituito il catalogo prodotti");
      const pageProducts = await mapShopifyProducts(endpoint, token, data.products.nodes || [], data.shop?.currencyCode);
      const imported = await persistExtractedProducts(botId, shop.origin, pageProducts, {
        sourceType: "shopify",
        sourceName: `Shopify: ${shop.hostname}`,
        reconcileVariants: true,
        jobId: options.jobId,
        jobLeaseVersion: options.jobLeaseVersion,
        incrementalJob: true,
      });
      if (imported.failed > 0) throw new Error(`${imported.failed} prodotti non importati nella pagina Shopify`);

      const hasNextPage = Boolean(data.products.pageInfo?.hasNextPage);
      const nextCursor = hasNextPage ? data.products.pageInfo?.endCursor : null;
      if (hasNextPage && !nextCursor) throw new Error("Paginazione Shopify non valida: cursor mancante");
      const nextPageNumber = resumableJob.pagesProcessed + invocationPage + 1;
      const progress = Math.min(92, 8 + Math.round(84 * (1 - Math.exp(-nextPageNumber / 12))));
      const checkpointed = await prisma.productSyncJob.updateMany({
        where: {
          id: resumableJob.id,
          status: "running",
          ...(options.jobLeaseVersion !== undefined ? { leaseVersion: options.jobLeaseVersion } : {}),
        },
        data: {
          checkpoint: hasNextPage ? nextCursor : COMPLETED_SNAPSHOT_CHECKPOINT,
          pagesProcessed: { increment: 1 },
          productsSeen: { increment: pageProducts.length },
          productsCreated: { increment: imported.created },
          productsUpdated: { increment: imported.updated },
          progress,
          errorMessage: null,
          startedAt: new Date(),
        },
      });
      if (checkpointed.count !== 1) throw new Error("Lease del job Shopify persa durante il checkpoint");
      await options.onProgress?.(progress, `Sincronizzati ${nextPageNumber * 100 - (100 - pageProducts.length)} prodotti Shopify`);

      if (!hasNextPage) {
        await finalizeAuthoritativeSnapshot(botId, resumableJob.sourceId, resumableJob.snapshotStartedAt || resumableJob.createdAt);
        const totals = await prisma.productSyncJob.findUniqueOrThrow({ where: { id: resumableJob.id } });
        return { created: totals.productsCreated, updated: totals.productsUpdated, failed: totals.productsFailed };
      }
      cursor = nextCursor;
    }
    const totals = await prisma.productSyncJob.findUniqueOrThrow({ where: { id: resumableJob.id } });
    return { created: totals.productsCreated, updated: totals.productsUpdated, failed: totals.productsFailed, continuation: true };
  }

  const products: ExtractedProduct[] = [];
  let cursor: string | null = null;
  for (let page = 0; ; page += 1) {
    const data = await shopifyGraphql(endpoint, token, query, { cursor });
    if (!data.products) throw new Error("Shopify API non ha restituito il catalogo prodotti");
    products.push(...await mapShopifyProducts(endpoint, token, data.products.nodes || [], data.shop?.currencyCode));
    await options.onProgress?.(Math.min(45, 15 + ((page + 1) * 3)), `Letti ${products.length} prodotti da Shopify`);
    if (!data.products.pageInfo.hasNextPage) {
      break;
    }
    cursor = data.products.pageInfo.endCursor;
  }
  return persistExtractedProducts(botId, shop.origin, products, {
    sourceType: "shopify",
    sourceName: `Shopify: ${shop.hostname}`,
    reconcileVariants: true,
    authoritativeSnapshot: true,
    jobId: options.jobId,
    jobLeaseVersion: options.jobLeaseVersion,
    onProgress: options.onProgress,
  });
}

function wooPrice(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function wooTotalPages(headers: Headers, page: number, itemCount: number) {
  const raw = headers.get("x-wp-totalpages") || headers.get("x-wc-totalpages");
  if (!raw) return itemCount === 100 ? page + 1 : page;
  const total = Number(raw);
  if (!Number.isInteger(total) || total < 0 || total > 100_000) {
    throw new Error("Paginazione WooCommerce non valida");
  }
  return total;
}

async function completeWooCommerceVariations(
  config: WooCommerceConnectionConfig,
  productId: string,
) {
  const variations: any[] = [];
  for (let page = 1; ; page += 1) {
    const response = await wooCommerceRequestWithMeta<any[]>(
      config,
      `/wp-json/wc/v3/products/${encodeURIComponent(productId)}/variations?status=publish&per_page=100&page=${page}&orderby=id&order=asc`,
    );
    if (!Array.isArray(response.data)) throw new Error(`Varianti WooCommerce non valide per il prodotto ${productId}`);
    variations.push(...response.data);
    const totalPages = wooTotalPages(response.headers, page, response.data.length);
    if (page >= totalPages || response.data.length === 0) break;
    if (page >= 10_000) throw new Error(`Il prodotto WooCommerce ${productId} supera il limite di sicurezza delle varianti`);
  }
  return variations;
}

async function mapWooCommerceProducts(
  config: WooCommerceConnectionConfig,
  items: any[],
  currency: string | undefined,
) {
  const products: ExtractedProduct[] = [];
  for (const item of items) {
    const externalId = item?.id ? String(item.id) : "";
    const canonicalUrl = safeHttpsUrl(item?.permalink);
    if (!externalId || !canonicalUrl || !item?.name || item.status !== "publish") continue;
    const images = (item.images || [])
      .map((image: any) => safeHttpsUrl(image?.src))
      .filter((url: string | undefined): url is string => Boolean(url));
    const rawVariants = item.type === "variable"
      ? await completeWooCommerceVariations(config, externalId)
      : [item];
    const variants = rawVariants.map((variant: any, index: number) => {
      const variantId = String(variant.id || externalId);
      const price = wooPrice(variant.price);
      const regularPrice = wooPrice(variant.regular_price);
      const available = variant.purchasable !== false
        && variant.status !== "private"
        && String(variant.stock_status || "instock") !== "outofstock";
      const attributes = Object.fromEntries((variant.attributes || [])
        .filter((attribute: any) => attribute?.name && attribute?.option)
        .map((attribute: any) => [String(attribute.name), String(attribute.option)]));
      const optionTitle = Object.values(attributes).join(" / ");
      return {
        identityKey: identity("woocommerce-variant", variantId),
        externalId: variantId,
        sku: variant.sku || undefined,
        title: optionTitle || variant.name || item.name,
        price,
        compareAtPrice: regularPrice !== undefined && price !== undefined && regularPrice > price ? regularPrice : undefined,
        currency,
        available,
        stockQuantity: Number.isFinite(Number(variant.stock_quantity)) ? Number(variant.stock_quantity) : undefined,
        productUrl: safeHttpsUrl(variant.permalink) || canonicalUrl,
        imageUrl: safeHttpsUrl(variant.image?.src) || images[0],
        attributes,
        position: index,
      };
    });
    products.push({
      identityKey: identity("woocommerce", externalId),
      externalId,
      canonicalUrl,
      title: item.name,
      description: plainText(item.short_description || item.description),
      brand: item.brands?.[0]?.name || undefined,
      productType: item.type || undefined,
      categories: (item.categories || []).map((category: any) => category.name).filter(Boolean),
      tags: (item.tags || []).map((tag: any) => tag.name).filter(Boolean),
      mainImageUrl: images[0],
      imageUrls: images,
      availableForSale: variants.some((variant) => variant.available),
      variants,
      metadata: { source: "woocommerce", averageRating: item.average_rating, status: item.status },
    });
  }
  return products;
}

async function syncWooCommerce(botId: string, config: WooCommerceConnectionConfig, options: CommerceSyncOptions) {
  const store = await assertSafeRemoteUrl(String(config.storeUrl || ""));
  const currencyData = await wooCommerceRequest(config, "/wp-json/wc/v3/data/currencies/current") as any;
  const currency = /^[A-Z]{3}$/.test(String(currencyData?.code || "")) ? String(currencyData.code) : undefined;
  const resumableJob = options.jobId ? await prisma.productSyncJob.findFirst({
    where: {
      id: options.jobId,
      botId,
      status: "running",
      ...(options.jobLeaseVersion !== undefined ? { leaseVersion: options.jobLeaseVersion } : {}),
    },
  }) : null;
  if (options.jobId && !resumableJob) throw new Error("Lease del job WooCommerce non valida");

  if (resumableJob) {
    if (resumableJob.checkpoint === COMPLETED_SNAPSHOT_CHECKPOINT) {
      await finalizeAuthoritativeSnapshot(botId, resumableJob.sourceId, resumableJob.snapshotStartedAt || resumableJob.startedAt || new Date());
      return { created: resumableJob.productsCreated, updated: resumableJob.productsUpdated, failed: resumableJob.productsFailed };
    }
    let page = resumableJob.checkpoint?.startsWith("woo:")
      ? Number(resumableJob.checkpoint.slice(4))
      : 1;
    if (!Number.isInteger(page) || page < 1) throw new Error("Checkpoint WooCommerce non valido");
    let seenThisInvocation = 0;
    for (let invocationPage = 0; invocationPage < 3; invocationPage += 1) {
      const response = await wooCommerceRequestWithMeta<any[]>(config, `/wp-json/wc/v3/products?status=publish&per_page=100&page=${page}&orderby=id&order=asc`);
      if (!Array.isArray(response.data)) throw new Error("Risposta prodotti WooCommerce non valida");
      const pageProducts = await mapWooCommerceProducts(config, response.data, currency);
      seenThisInvocation += pageProducts.length;
      const imported = await persistExtractedProducts(botId, store.origin, pageProducts, {
        sourceType: "woocommerce",
        sourceName: `WooCommerce: ${store.hostname}`,
        reconcileVariants: true,
        jobId: options.jobId,
        jobLeaseVersion: options.jobLeaseVersion,
        incrementalJob: true,
      });
      if (imported.failed > 0) throw new Error(`${imported.failed} prodotti non importati nella pagina WooCommerce`);
      const totalPages = wooTotalPages(response.headers, page, response.data.length);
      const hasNextPage = page < totalPages && response.data.length > 0;
      const progress = Math.min(92, totalPages > 0 ? 8 + Math.round(84 * Math.min(1, page / totalPages)) : 92);
      const checkpointed = await prisma.productSyncJob.updateMany({
        where: {
          id: resumableJob.id,
          status: "running",
          ...(options.jobLeaseVersion !== undefined ? { leaseVersion: options.jobLeaseVersion } : {}),
        },
        data: {
          checkpoint: hasNextPage ? `woo:${page + 1}` : COMPLETED_SNAPSHOT_CHECKPOINT,
          pagesProcessed: { increment: 1 },
          productsSeen: { increment: pageProducts.length },
          productsCreated: { increment: imported.created },
          productsUpdated: { increment: imported.updated },
          progress,
          errorMessage: null,
          startedAt: new Date(),
        },
      });
      if (checkpointed.count !== 1) throw new Error("Lease del job WooCommerce persa durante il checkpoint");
      await options.onProgress?.(progress, `Sincronizzati ${resumableJob.productsSeen + seenThisInvocation} prodotti WooCommerce`);
      if (!hasNextPage) {
        await finalizeAuthoritativeSnapshot(botId, resumableJob.sourceId, resumableJob.snapshotStartedAt || resumableJob.createdAt);
        const totals = await prisma.productSyncJob.findUniqueOrThrow({ where: { id: resumableJob.id } });
        return { created: totals.productsCreated, updated: totals.productsUpdated, failed: totals.productsFailed };
      }
      page += 1;
    }
    const totals = await prisma.productSyncJob.findUniqueOrThrow({ where: { id: resumableJob.id } });
    return { created: totals.productsCreated, updated: totals.productsUpdated, failed: totals.productsFailed, continuation: true };
  }

  const products: ExtractedProduct[] = [];
  for (let page = 1; ; page += 1) {
    const response = await wooCommerceRequestWithMeta<any[]>(config, `/wp-json/wc/v3/products?status=publish&per_page=100&page=${page}&orderby=id&order=asc`);
    if (!Array.isArray(response.data)) throw new Error("Risposta prodotti WooCommerce non valida");
    products.push(...await mapWooCommerceProducts(config, response.data, currency));
    const totalPages = wooTotalPages(response.headers, page, response.data.length);
    await options.onProgress?.(Math.min(45, 15 + (page * 3)), `Letti ${products.length} prodotti da WooCommerce`);
    if (page >= totalPages || response.data.length === 0) break;
  }
  return persistExtractedProducts(botId, store.origin, products, {
    sourceType: "woocommerce",
    sourceName: `WooCommerce: ${store.hostname}`,
    reconcileVariants: true,
    authoritativeSnapshot: true,
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
      : await syncWooCommerce(botId, decryptConfigSecrets(JSON.parse(connection.config)) as WooCommerceConnectionConfig, options);
    const continuation = "continuation" in result && result.continuation === true;
    await prisma.integrationConnection.update({ where: { id: connection.id }, data: { status: continuation ? "syncing" : "connected", lastTestedAt: new Date(), lastError: null } });
    return result;
  } catch (error) {
    await prisma.integrationConnection.update({ where: { id: connection.id }, data: { status: "error", lastTestedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 1000) : "Sync fallita" } });
    throw error;
  }
}
