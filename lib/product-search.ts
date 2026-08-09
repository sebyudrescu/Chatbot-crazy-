import "server-only";

import { prisma } from "./db";
import {
  matchesCommerceConstraints,
  normalizeCommerceText,
  parseCommerceQuery,
  structuredCommerceSearchTerms,
  type CommerceIntent,
  type ParsedCommerceQuery,
} from "./commerce-query";
import type { PageContext, ProductSelection } from "./commerce-types";

const STOP_WORDS = new Set([
  "che",
  "cosa",
  "come",
  "con",
  "del",
  "della",
  "delle",
  "dei",
  "degli",
  "per",
  "una",
  "uno",
  "gli",
  "nel",
  "nella",
  "vorrei",
  "voglio",
  "potresti",
  "puoi",
  "mostra",
  "dammi",
  "consiglia",
  "consigliami",
  "prodotto",
  "prodotti",
  "articolo",
  "articoli",
  "avete",
  "vendete",
  "cerco",
  "cercando",
  "serve",
  "servirebbe",
  "farmi",
  "vedere",
  "mostrami",
  "mostrarmi",
  "propormi",
  "altri",
  "sotto",
  "entro",
  "massimo",
  "euro",
  "eur",
  "prezzo",
  "prezzi",
  "taglia",
  "taglie",
  "colore",
  "colori",
  "numero",
  "reale",
  "reali",
  "realmente",
  "adesso",
  "disponibile",
  "disponibili",
  "link",
  "pagina",
  "pagine",
  "esatto",
  "esatta",
  "esatti",
  "esatte",
  "fammi",
  "dettaglio",
  "dettagli",
  "scheda",
  "schede",
  "solo",
  "senza",
  "non",
  "the",
  "and",
  "for",
  "with",
  "show",
  "give",
  "recommend",
  "product",
  "products",
  "please",
]);

function tokenForms(token: string) {
  const forms = new Set([token]);
  if (token.length >= 5 && /[aeio]$/.test(token)) forms.add(token.slice(0, -1));
  return [...forms];
}

function containsToken(text: string, token: string) {
  return tokenForms(token).some((form) => text.includes(form));
}

function tokens(query: string) {
  return [
    ...new Set(
      normalizeCommerceText(query)
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
    ),
  ].slice(0, 12);
}

function jsonStrings(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function jsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function variantOptionSummary(
  variants: Array<{ attributes: string; available: boolean }>,
) {
  const values = new Map<
    string,
    { available: Set<string>; unavailable: Set<string> }
  >();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(
      jsonRecord(variant.attributes),
    )) {
      const entry = values.get(name) ?? {
        available: new Set<string>(),
        unavailable: new Set<string>(),
      };
      (variant.available ? entry.available : entry.unavailable).add(value);
      values.set(name, entry);
    }
  }
  return [...values.entries()]
    .map(([name, entry]) => {
      const available = [...entry.available];
      const unavailable = [...entry.unavailable].filter(
        (value) => !entry.available.has(value),
      );
      return `${name}: disponibili ${available.join(", ") || "nessuno"}${unavailable.length ? `; non disponibili ${unavailable.join(", ")}` : ""}`;
    })
    .join(" | ");
}

export interface ProductSearchResult {
  selections: ProductSelection[];
  promptContext: string;
  catalogSize: number;
  query: ParsedCommerceQuery;
}

export async function hasVerifiedProductSource(botId: string) {
  const source = await prisma.productSource.findFirst({
    where: { botId, status: "active" },
    select: { id: true },
  });
  return Boolean(source);
}

export async function searchVerifiedProducts(
  botId: string,
  query: string,
  pageContext?: PageContext,
  options: { intent?: CommerceIntent; activeProductIds?: string[] } = {},
): Promise<ProductSearchResult> {
  const parsed = parseCommerceQuery(query);
  if (options.intent) parsed.intent = options.intent;
  const queryTokens = [...new Set([...tokens(query), ...structuredCommerceSearchTerms(parsed)])];
  const queryForms = [...new Set(queryTokens.flatMap(tokenForms))];
  const isCatalogIntent = [
    "product_discovery",
    "product_detail",
    "variant_availability",
    "product_comparison",
    "fit_advice",
  ].includes(parsed.intent);
  if (!isCatalogIntent && !pageContext?.productId && !pageContext?.sku) {
    return { selections: [], promptContext: "", catalogSize: 0, query: parsed };
  }

  const activeProductIds = (options.activeProductIds || []).slice(0, 5);
  const exactSelectors = [
    pageContext?.productId ? { externalId: pageContext.productId } : undefined,
    pageContext?.sku
      ? {
          variants: {
            some: {
              sku: { equals: pageContext.sku, mode: "insensitive" as const },
            },
          },
        }
      : undefined,
    activeProductIds.length ? { id: { in: activeProductIds } } : undefined,
  ].filter(Boolean);
  const textSelectors = queryForms.flatMap((token) => [
    { title: { contains: token, mode: "insensitive" as const } },
    { description: { contains: token, mode: "insensitive" as const } },
    { brand: { contains: token, mode: "insensitive" as const } },
    { productType: { contains: token, mode: "insensitive" as const } },
    {
      variants: {
        some: { sku: { contains: token, mode: "insensitive" as const } },
      },
    },
  ]);

  const [products, catalogSize] = await Promise.all([
    prisma.product.findMany({
      where: {
        botId,
        status: "active",
        recommendationStatus: { notIn: ["excluded", "blocked"] },
        OR: [...exactSelectors, ...textSelectors].length
          ? ([...exactSelectors, ...textSelectors] as any)
          : undefined,
      },
      include: { variants: { orderBy: { position: "asc" } } },
      take: 500,
    }),
    prisma.product.count({
      where: {
        botId,
        status: "active",
        recommendationStatus: { notIn: ["excluded", "blocked"] },
      },
    }),
  ]);

  const normalizedQuery = normalizeCommerceText(query);
  const ranked = products
    .flatMap((product) => {
      const title = normalizeCommerceText(product.title);
      const variantAttributes = product.variants
        .flatMap((variant) =>
          Object.entries(jsonRecord(variant.attributes)).flat(),
        )
        .join(" ");
      const structured = normalizeCommerceText(
        [
          product.title,
          product.brand,
          product.productType,
          ...jsonStrings(product.categories),
          ...jsonStrings(product.tags),
          variantAttributes,
        ]
          .filter(Boolean)
          .join(" "),
      );
      const descriptive = normalizeCommerceText(
        `${structured} ${product.description}`,
      );

      const availableVariants = product.variants.filter(
        (variant) => variant.available,
      );
      if (
        !matchesCommerceConstraints(parsed, {
          structuredText: structured,
          descriptiveText: descriptive,
          availableForSale: product.availableForSale,
          availablePrices: availableVariants.flatMap((variant) =>
            variant.price === null ? [] : [variant.price],
          ),
          availableOptionValues: availableVariants.flatMap((variant) =>
            Object.values(jsonRecord(variant.attributes)),
          ),
        })
      )
        return [];

      let eligibleVariants = availableVariants;
      if (parsed.minPrice !== undefined)
        eligibleVariants = eligibleVariants.filter(
          (variant) =>
            variant.price !== null && variant.price >= parsed.minPrice!,
        );
      if (parsed.maxPrice !== undefined)
        eligibleVariants = eligibleVariants.filter(
          (variant) =>
            variant.price !== null && variant.price <= parsed.maxPrice!,
        );
      if (parsed.size)
        eligibleVariants = eligibleVariants.filter((variant) => {
          const attrs = Object.values(jsonRecord(variant.attributes)).map(
            (value) => normalizeCommerceText(value),
          );
          return (
            attrs.includes(normalizeCommerceText(parsed.size!)) ||
            normalizeCommerceText(variant.title || "") ===
              normalizeCommerceText(parsed.size!)
          );
        });
      if (product.variants.length > 0 && eligibleVariants.length === 0)
        return [];

      let variant = pageContext?.sku
        ? eligibleVariants.find(
            (item) =>
              item.sku?.toLowerCase() === pageContext.sku?.toLowerCase(),
          )
        : (eligibleVariants[0] ??
          product.variants.find((item) => item.available) ??
          product.variants[0]);
      if (pageContext?.sku && !variant) return [];

      let score = 20 + product.rankingBoost;
      const now = new Date();
      const campaignActive =
        (!product.campaignStart || product.campaignStart <= now) &&
        (!product.campaignEnd || product.campaignEnd >= now);
      if (product.recommendationStatus === "promoted" && campaignActive)
        score += 30;
      if (
        pageContext?.productId &&
        product.externalId === pageContext.productId
      )
        score += 500;
      if (
        pageContext?.sku &&
        variant?.sku?.toLowerCase() === pageContext.sku.toLowerCase()
      )
        score += 500;
      if (activeProductIds.includes(product.id)) score += 250;
      if (title.length >= 4 && normalizedQuery.includes(title)) score += 600;

      let lexicalMatches = 0;
      for (const token of queryTokens) {
        if (containsToken(title, token)) {
          score += 35;
          lexicalMatches++;
        } else if (containsToken(structured, token)) {
          score += 18;
          lexicalMatches++;
        } else if (containsToken(descriptive, token)) {
          score += 4;
          lexicalMatches++;
        }
        if (
          product.variants.some(
            (item) =>
              item.sku && containsToken(normalizeCommerceText(item.sku), token),
          )
        ) {
          score += 35;
          lexicalMatches++;
        }
      }
      if (parsed.category) score += 80;
      if (parsed.colors.length) score += 45;
      if (parsed.materials.length) score += 35;
      if (parsed.gender) score += 20;
      if (
        !parsed.category &&
        lexicalMatches === 0 &&
        !activeProductIds.includes(product.id)
      )
        return [];

      // Brand, price and availability already have dedicated fields in the card.
      // Repeating them as a personalized reason is misleading and visually noisy.
      return [{ product, variant, score, reason: "" }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.product.title.localeCompare(b.product.title, "it"),
    )
    .slice(
      0,
      parsed.maxCards > 0
        ? Math.max(
            parsed.maxCards,
            parsed.intent === "product_comparison" ? 2 : 1,
          )
        : 1,
    );

  const selections = ranked.map(({ product, variant, reason }) => ({
    productId: product.id,
    variantId: variant?.id,
    reason,
  }));
  const promptContext =
    ranked.length === 0
      ? ""
      : [
          "\n\n## CATALOGO COMMERCIALE VERIFICATO",
          "Usa esclusivamente questi dati per prezzo, stock, immagini, URL, SKU e varianti. Non inventare dati mancanti.",
          ...ranked.map(({ product, variant }, index) => {
            const optionSummary = variantOptionSummary(product.variants);
            return `${index + 1}. ${product.title}${product.brand ? ` — ${product.brand}` : ""}${variant?.price !== null && variant?.price !== undefined ? ` — ${variant.price.toFixed(2)} ${variant.currency || ""}` : ""} — ${product.availableForSale ? "disponibile" : "non disponibile"} — URL: ${product.canonicalUrl}${optionSummary ? ` — Varianti: ${optionSummary}` : ""}${product.description ? ` — Descrizione: ${product.description.slice(0, 500)}` : ""}`;
          }),
        ].join("\n");

  return { selections, promptContext, catalogSize, query: parsed };
}
