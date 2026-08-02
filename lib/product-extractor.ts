import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { safeHttpsUrl } from "./commerce-types";

export interface ExtractedProductVariant {
  identityKey: string;
  externalId?: string;
  sku?: string;
  title?: string;
  price?: number;
  compareAtPrice?: number;
  currency?: string;
  available: boolean;
  stockQuantity?: number;
  productUrl?: string;
  imageUrl?: string;
  attributes: Record<string, string>;
}

export interface ExtractedProduct {
  identityKey: string;
  externalId?: string;
  canonicalUrl: string;
  title: string;
  description: string;
  brand?: string;
  productType?: string;
  categories: string[];
  tags?: string[];
  mainImageUrl?: string;
  imageUrls: string[];
  availableForSale: boolean;
  variants: ExtractedProductVariant[];
  metadata: Record<string, unknown>;
}

type JsonRecord = Record<string, any>;

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function absoluteHttps(value: unknown, pageUrl: string) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try { return safeHttpsUrl(new URL(value, pageUrl).toString()); }
  catch { return undefined; }
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof (value as JsonRecord).name === "string") {
    return (value as JsonRecord).name.trim();
  }
  return "";
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isAvailable(value: unknown) {
  if (typeof value !== "string") return true;
  const normalized = value.toLowerCase();
  return !normalized.includes("outofstock") && !normalized.includes("soldout") && !normalized.includes("discontinued");
}

function typeIncludes(value: unknown, expected: string) {
  return asArray(value).some((item) => typeof item === "string" && item.toLowerCase() === expected.toLowerCase());
}

function flattenJsonLd(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const record = value as JsonRecord;
  return [record, ...flattenJsonLd(record["@graph"]), ...flattenJsonLd(record.mainEntity)];
}

function imageUrls(value: unknown, pageUrl: string) {
  return asArray(value)
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return undefined;
      const image = item as JsonRecord;
      return image.url ?? image.contentUrl;
    })
    .map((item) => absoluteHttps(item, pageUrl))
    .filter((item): item is string => Boolean(item));
}

function offerToVariant(offer: JsonRecord, product: JsonRecord, pageUrl: string, index: number): ExtractedProductVariant {
  const sku = text(offer.sku) || text(product.sku) || undefined;
  const externalId = text(offer.productID) || text(offer["@id"]) || undefined;
  const productUrl = absoluteHttps(offer.url, pageUrl) ?? absoluteHttps(product.url, pageUrl);
  const keySource = externalId || sku || productUrl || `${text(product.name)}:${index}`;
  return {
    identityKey: `jsonld:${createHash("sha256").update(keySource).digest("hex")}`,
    externalId,
    sku,
    title: text(offer.name) || undefined,
    price: number(offer.price ?? offer.lowPrice),
    compareAtPrice: number(offer.highPrice),
    currency: text(offer.priceCurrency).toUpperCase() || undefined,
    available: isAvailable(offer.availability),
    productUrl,
    imageUrl: imageUrls(offer.image, pageUrl)[0],
    attributes: {},
  };
}

function structuredProduct(record: JsonRecord, pageUrl: string, canonicalFallback: string): ExtractedProduct | null {
  const title = text(record.name);
  const canonicalUrl = absoluteHttps(record.url, pageUrl) ?? canonicalFallback;
  if (!title || !canonicalUrl) return null;
  const offers = asArray<JsonRecord>(record.offers).filter((offer) => offer && typeof offer === "object");
  const variants = offers.map((offer, index) => offerToVariant(offer, record, pageUrl, index));
  const images = imageUrls(record.image, pageUrl);
  const externalId = text(record.productID) || text(record["@id"]) || undefined;
  const identitySource = externalId || canonicalUrl;
  return {
    identityKey: `jsonld:${createHash("sha256").update(identitySource).digest("hex")}`,
    externalId,
    canonicalUrl,
    title,
    description: text(record.description),
    brand: text(record.brand) || undefined,
    productType: text(record.category) || undefined,
    categories: text(record.category) ? [text(record.category)] : [],
    tags: asArray(record.keywords).flatMap((value) => typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : []),
    mainImageUrl: images[0],
    imageUrls: images,
    availableForSale: variants.length === 0 || variants.some((variant) => variant.available),
    variants,
    metadata: { source: "jsonld", schemaType: record["@type"] },
  };
}

export function extractProductsFromHtml(html: string, pageUrl: string): ExtractedProduct[] {
  const $ = cheerio.load(html);
  const canonical = absoluteHttps($("link[rel='canonical']").attr("href"), pageUrl)
    ?? safeHttpsUrl(pageUrl);
  if (!canonical) return [];

  const products: ExtractedProduct[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const parsed = JSON.parse($(element).html() || "null");
      for (const record of flattenJsonLd(parsed)) {
        if (!typeIncludes(record["@type"], "Product")) continue;
        const product = structuredProduct(record, pageUrl, canonical);
        if (product) products.push(product);
      }
    } catch {
      // Invalid structured data must not break the rest of the crawl.
    }
  });

  if (products.length === 0) {
    const title = $("meta[property='og:title']").attr("content")?.trim();
    const productMarker = $("meta[property='og:type']").attr("content")?.toLowerCase();
    if (title && (productMarker === "product" || $("[itemtype*='Product']").length > 0)) {
      const image = absoluteHttps($("meta[property='og:image']").attr("content"), pageUrl);
      products.push({
        identityKey: `opengraph:${createHash("sha256").update(canonical).digest("hex")}`,
        canonicalUrl: canonical,
        title,
        description: $("meta[property='og:description']").attr("content")?.trim() || "",
        categories: [],
        tags: [],
        mainImageUrl: image,
        imageUrls: image ? [image] : [],
        availableForSale: true,
        variants: [],
        metadata: { source: "opengraph" },
      });
    }
  }

  return [...new Map(products.map((product) => [product.identityKey, product])).values()];
}
