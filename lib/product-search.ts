import "server-only";

import { prisma } from "./db";
import type { PageContext, ProductSelection } from "./commerce-types";

const COMMERCE_TERMS = /\b(prodott[oi]|articol[oi]|catalogo|prezzo|cost[oa]|comprare|acquist|disponibil|taglia|colore|modello|variante|sku|consiglia|raccomand|confront|alternativ|offerta|sconto|shop|scarpe|borsa|product|price|buy|recommend|compare|size|colour|color|stock)\b/i;
const STOP_WORDS = new Set([
  "che", "cosa", "come", "con", "del", "della", "delle", "dei", "degli", "per", "una", "uno", "gli", "nel", "nella",
  "vorrei", "voglio", "potresti", "puoi", "mostra", "dammi", "consiglia", "consigliami", "prodotto", "prodotti", "articolo", "articoli",
  "avete", "vendete", "cerco", "cercando", "serve", "servirebbe", "farmi", "vedere", "mostrami", "mostrarmi",
  "sotto", "entro", "massimo", "euro", "eur", "prezzo",
  "the", "and", "for", "with", "show", "give", "recommend", "product", "products", "please",
]);

function tokens(query: string) {
  return [...new Set(query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))]
    .slice(0, 8);
}

function parseAmount(value: string) {
  const parsed = Number(value.replace(".", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function priceBounds(query: string) {
  const max = query.match(/(?:sotto|entro|massimo|max|meno di|under|up to)\s*(?:€|eur|euro)?\s*([0-9.,]+)/i);
  const min = query.match(/(?:sopra|oltre|almeno|minimo|min|more than|over)\s*(?:€|eur|euro)?\s*([0-9.,]+)/i);
  const range = query.match(/(?:tra|da|between)\s*(?:€|eur|euro)?\s*([0-9.,]+)\s*(?:e|a|and|-)\s*(?:€|eur|euro)?\s*([0-9.,]+)/i);
  return {
    min: range ? parseAmount(range[1]) : min ? parseAmount(min[1]) : undefined,
    max: range ? parseAmount(range[2]) : max ? parseAmount(max[1]) : undefined,
  };
}

function jsonStrings(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

export interface ProductSearchResult {
  selections: ProductSelection[];
  promptContext: string;
  catalogSize: number;
}

export async function searchVerifiedProducts(
  botId: string,
  query: string,
  pageContext?: PageContext,
): Promise<ProductSearchResult> {
  const queryTokens = tokens(query);
  const commerceIntent = COMMERCE_TERMS.test(query) || Boolean(pageContext?.productId || pageContext?.sku);
  if (!commerceIntent && queryTokens.length === 0) return { selections: [], promptContext: "", catalogSize: 0 };

  const exactSelectors = [
    pageContext?.productId ? { externalId: pageContext.productId } : undefined,
    pageContext?.sku ? { variants: { some: { sku: { equals: pageContext.sku, mode: "insensitive" as const } } } } : undefined,
  ].filter(Boolean);
  const textSelectors = queryTokens.flatMap((token) => [
    { title: { contains: token, mode: "insensitive" as const } },
    { description: { contains: token, mode: "insensitive" as const } },
    { brand: { contains: token, mode: "insensitive" as const } },
    { productType: { contains: token, mode: "insensitive" as const } },
    { variants: { some: { sku: { contains: token, mode: "insensitive" as const } } } },
  ]);

  const [products, catalogSize] = await Promise.all([prisma.product.findMany({
    where: {
      botId,
      status: "active",
      recommendationStatus: { notIn: ["excluded", "blocked"] },
      OR: [...exactSelectors, ...textSelectors].length ? [...exactSelectors, ...textSelectors] as any : undefined,
    },
    include: { variants: { orderBy: { position: "asc" } } },
    take: 50,
  }), prisma.product.count({
    where: {
      botId,
      status: "active",
      recommendationStatus: { notIn: ["excluded", "blocked"] },
    },
  })]);
  const bounds = priceBounds(query);

  const ranked = products.flatMap((product) => {
    const searchable = [product.title, product.description, product.brand, product.productType, ...jsonStrings(product.categories), ...jsonStrings(product.tags)]
      .filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let variant = pageContext?.sku
      ? product.variants.find((item) => item.sku?.toLowerCase() === pageContext.sku?.toLowerCase())
      : product.variants.find((item) => item.available) ?? product.variants[0];
    const pricedVariants = product.variants.filter((item) => item.price !== null
      && (bounds.min === undefined || item.price >= bounds.min)
      && (bounds.max === undefined || item.price <= bounds.max));
    if ((bounds.min !== undefined || bounds.max !== undefined) && pricedVariants.length === 0) return [];
    if (pricedVariants.length > 0 && (!variant?.price || !pricedVariants.includes(variant))) variant = pricedVariants[0];

    let score = (product.availableForSale ? 20 : -30) + product.rankingBoost;
    const now = new Date();
    const campaignActive = (!product.campaignStart || product.campaignStart <= now)
      && (!product.campaignEnd || product.campaignEnd >= now);
    if (product.recommendationStatus === "promoted" && campaignActive) score += 30;
    if (pageContext?.productId && product.externalId === pageContext.productId) score += 200;
    if (pageContext?.sku && variant?.sku?.toLowerCase() === pageContext.sku.toLowerCase()) score += 200;
    let titleMatches = 0;
    let skuMatches = 0;
    let lexicalMatches = 0;
    for (const token of queryTokens) {
      if (product.title.toLowerCase().includes(token)) { score += 25; titleMatches++; lexicalMatches++; }
      else if (searchable.includes(token)) { score += 8; lexicalMatches++; }
      if (product.variants.some((item) => item.sku?.toLowerCase().includes(token))) { score += 35; skuMatches++; lexicalMatches++; }
    }
    if (!commerceIntent && titleMatches === 0 && skuMatches === 0) return [];
    if (commerceIntent && queryTokens.length >= 2 && lexicalMatches < 2) return [];
    const reasonParts = [
      product.brand ? `Brand: ${product.brand}` : undefined,
      variant?.price !== null && variant?.price !== undefined ? `Prezzo: ${variant.price.toFixed(2)} ${variant.currency || ""}`.trim() : undefined,
      product.availableForSale && (variant?.available ?? true) ? "Disponibile" : "Non disponibile",
    ].filter(Boolean);
    return [{ product, variant, score, reason: reasonParts.join(" · ") }];
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  const selections = ranked.map(({ product, variant, reason }) => ({
    productId: product.id,
    variantId: variant?.id,
    reason,
  }));
  const promptContext = ranked.length === 0 ? "" : [
    "\n\n## CATALOGO COMMERCIALE VERIFICATO",
    "Usa esclusivamente i dati seguenti per parlare dei prodotti. Non inventare prezzo, stock, immagini, URL o varianti. Le relative card saranno mostrate separatamente.",
    ...ranked.map(({ product, variant }, index) => `${index + 1}. ${product.title}${product.brand ? ` — ${product.brand}` : ""}${variant?.price !== null && variant?.price !== undefined ? ` — ${variant.price.toFixed(2)} ${variant.currency || ""}` : ""} — ${product.availableForSale && (variant?.available ?? true) ? "disponibile" : "non disponibile"}${product.merchandisingNote ? ` — Nota verificata: ${product.merchandisingNote}` : ""}`),
  ].join("\n");

  return { selections, promptContext, catalogSize };
}
