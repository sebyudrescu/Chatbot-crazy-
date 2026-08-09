import "server-only";

import { z } from "zod";
import { prisma } from "./db";
import { hydrateProductCards } from "./commerce-catalog";
import type { OrderStatusCard, ProductCard } from "./commerce-types";
import { retrieveForQuery } from "./multi-dimensional-retrieval";
import { tryVerifiedOrderLookup } from "./order-tracking";
import { searchVerifiedProducts } from "./product-search";

export type AgentToolName =
  | "search_products"
  | "get_product"
  | "check_inventory"
  | "present_products"
  | "search_knowledge_base"
  | "get_order_status";

export const AGENT_TOOL_NAMES = new Set<AgentToolName>([
  "search_products",
  "get_product",
  "check_inventory",
  "present_products",
  "search_knowledge_base",
  "get_order_status",
]);

export function isAgentToolName(value: string): value is AgentToolName {
  return AGENT_TOOL_NAMES.has(value as AgentToolName);
}

export interface AgentToolContext {
  botId: string;
  conversationId: string;
  rateLimitScope: string;
  recentMessages: Array<{ role: string; content: string }>;
  previousAssistantText?: string;
  retrievalMinScore?: number;
  rerankerEnabled?: boolean;
  liveWebSearchEnabled?: boolean;
  liveWebAllowedDomains?: string[];
}

export interface AgentToolArtifacts {
  productCards: ProductCard[];
  orderStatusCard?: OrderStatusCard;
  orderLookupForm: boolean;
  persistedResponse?: string;
  handoff: boolean;
  sources: Array<{
    sourceId?: string;
    sourceType?: string;
    sourceUrl?: string;
    title?: string;
    score?: number;
  }>;
}

export interface AgentToolExecution {
  output: Record<string, unknown>;
  artifacts: AgentToolArtifacts;
}

const emptyArtifacts = (): AgentToolArtifacts => ({
  productCards: [],
  orderLookupForm: false,
  handoff: false,
  sources: [],
});

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

export const AGENT_TOOLS = [
  {
    type: "function",
    name: "search_products",
    description: "Cerca nel catalogo e-commerce verificato. Usalo per scoprire, consigliare o confrontare prodotti reali. Non usarlo per domande vaghe se manca ancora una preferenza utile, salvo che il cliente chieda esplicitamente di vedere subito il catalogo.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query", "category", "color", "material", "gender", "min_price", "max_price", "available_only", "exclude_product_ids", "limit"],
      properties: {
        query: { type: "string", description: "Descrizione sintetica di ciò che il cliente cerca, corretta semanticamente anche se il messaggio contiene refusi." },
        category: { ...nullableString, description: "Categoria o tipologia libera, oppure null." },
        color: { ...nullableString, description: "Colore richiesto, oppure null." },
        material: { ...nullableString, description: "Materiale richiesto, oppure null." },
        gender: { ...nullableString, description: "Destinatario o reparto, oppure null." },
        min_price: { ...nullableNumber, description: "Prezzo minimo, oppure null." },
        max_price: { ...nullableNumber, description: "Prezzo massimo, oppure null." },
        available_only: { type: "boolean" },
        exclude_product_ids: {
          type: "array",
          maxItems: 5,
          items: { type: "string" },
          description: "ID interni dei prodotti già mostrati da escludere quando il cliente chiede altro.",
        },
        limit: { type: "integer", minimum: 1, maximum: 5 },
      },
    },
  },
  {
    type: "function",
    name: "get_product",
    description: "Recupera la scheda verificata di un prodotto già identificato da search_products o presente nel contesto pagina.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["product_id"],
      properties: { product_id: { type: "string" } },
    },
  },
  {
    type: "function",
    name: "check_inventory",
    description: "Controlla l'inventario completo di un prodotto verificato. Restituisce sempre tutte le varianti, così puoi elencare correttamente taglie e colori; variant_id indica soltanto la variante di riferimento.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["product_id", "variant_id"],
      properties: {
        product_id: { type: "string" },
        variant_id: nullableString,
      },
    },
  },
  {
    type: "function",
    name: "present_products",
    description: "Mostra nel carosello solo i prodotti che hai scelto di consigliare. Chiamalo dopo la ricerca soltanto se il cliente ha chiesto di vedere prodotti; non chiamarlo per una semplice domanda su taglie, stock o dettagli.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["products"],
      properties: {
        products: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["product_id", "variant_id"],
            properties: {
              product_id: { type: "string" },
              variant_id: nullableString,
            },
          },
          description: "Coppie prodotto-variante esatte restituite dalla ricerca, nell'ordine in cui devono comparire.",
        },
      },
    },
  },
  {
    type: "function",
    name: "search_knowledge_base",
    description: "Cerca informazioni aziendali verificate: identità, servizi, politiche, spedizioni, resi, FAQ e contenuti del sito autorizzato.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string" } },
    },
  },
  {
    type: "function",
    name: "get_order_status",
    description: "Verifica in modo sicuro lo stato di un ordine Shopify o WooCommerce. Se mancano numero ordine o email, restituisce la richiesta sicura dei dati mancanti.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["order_number", "email"],
      properties: {
        order_number: nullableString,
        email: nullableString,
      },
    },
  },
] as const;

const SearchProductsArgs = z.object({
  query: z.string().trim().min(1).max(500),
  category: z.string().trim().max(100).nullable(),
  color: z.string().trim().max(60).nullable(),
  material: z.string().trim().max(60).nullable(),
  gender: z.string().trim().max(60).nullable(),
  min_price: z.number().min(0).max(1_000_000).nullable(),
  max_price: z.number().min(0).max(1_000_000).nullable(),
  available_only: z.boolean(),
  exclude_product_ids: z.array(z.string().uuid()).max(5),
  limit: z.number().int().min(1).max(5),
});
const ProductArgs = z.object({ product_id: z.string().uuid() });
const InventoryArgs = ProductArgs.extend({ variant_id: z.string().uuid().nullable() });
const PresentProductsArgs = z.object({
  products: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().nullable(),
  })).min(1).max(5),
});
const KnowledgeArgs = z.object({ query: z.string().trim().min(1).max(1000) });
const OrderArgs = z.object({
  order_number: z.string().trim().max(80).nullable(),
  email: z.string().email().max(320).nullable(),
});

function buildProductQuery(input: z.infer<typeof SearchProductsArgs>) {
  return [
    input.query,
    input.category,
    input.color,
    input.material,
    input.gender,
    input.min_price === null ? null : `sopra ${input.min_price} euro`,
    input.max_price === null ? null : `sotto ${input.max_price} euro`,
    input.available_only ? "solo disponibili" : null,
  ].filter(Boolean).join(" ");
}

function publicCard(card: ProductCard) {
  return {
    product_id: card.productId,
    variant_id: card.variantId || null,
    title: card.title,
    description: card.shortDescription,
    price: card.price ?? null,
    compare_at_price: card.compareAtPrice ?? null,
    currency: card.currency || null,
    availability: card.availability,
    options: card.options || [],
    url: card.productUrl,
  };
}

function safeJsonRecord(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export async function executeAgentTool(
  name: AgentToolName,
  rawArguments: unknown,
  context: AgentToolContext,
): Promise<AgentToolExecution> {
  if (!isAgentToolName(name)) throw new Error("unknown_agent_tool");
  if (name === "search_products") {
    const args = SearchProductsArgs.parse(rawArguments);
    const result = await searchVerifiedProducts(context.botId, buildProductQuery(args), undefined, {
      intent: "product_discovery",
      maxResults: args.limit,
      excludedProductIds: args.exclude_product_ids,
    });
    const cards = await hydrateProductCards(context.botId, result.selections);
    return {
      output: {
        found: cards.length,
        catalog_size: result.catalogSize,
        products: cards.map(publicCard),
        verified: true,
      },
      artifacts: emptyArtifacts(),
    };
  }

  if (name === "get_product") {
    const args = ProductArgs.parse(rawArguments);
    const cards = await hydrateProductCards(context.botId, [{ productId: args.product_id, reason: "" }]);
    return {
      output: cards[0] ? { found: true, product: publicCard(cards[0]), verified: true } : { found: false, verified: true },
      artifacts: emptyArtifacts(),
    };
  }

  if (name === "check_inventory") {
    const args = InventoryArgs.parse(rawArguments);
    const product = await prisma.product.findFirst({
      where: { id: args.product_id, botId: context.botId, status: "active" },
      include: { variants: { orderBy: { position: "asc" } } },
    });
    const variants = product?.variants
      .map((variant) => ({
        variant_id: variant.id,
        selected_reference: variant.id === args.variant_id,
        title: variant.title || null,
        sku: variant.sku || null,
        attributes: safeJsonRecord(variant.attributes),
        available: variant.available,
        stock_quantity: variant.stockQuantity,
        price: variant.price,
        currency: variant.currency,
      })) || [];
    return {
      output: {
        found: Boolean(product),
        product_id: product?.id || args.product_id,
        product_title: product?.title || null,
        available_for_sale: product?.availableForSale || false,
        variants,
        verified: true,
      },
      artifacts: emptyArtifacts(),
    };
  }

  if (name === "present_products") {
    const args = PresentProductsArgs.parse(rawArguments);
    const cards = await hydrateProductCards(
      context.botId,
      args.products.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id || undefined,
        reason: "",
      })),
    );
    return {
      output: {
        presented: cards.length,
        products: cards.map((card) => ({
          product_id: card.productId,
          variant_id: card.variantId || null,
        })),
        verified: true,
      },
      artifacts: { ...emptyArtifacts(), productCards: cards },
    };
  }

  if (name === "search_knowledge_base") {
    const args = KnowledgeArgs.parse(rawArguments);
    const result = await retrieveForQuery({
      botId: context.botId,
      conversationId: context.conversationId,
      query: args.query,
      intent: "question",
      entities: [],
      topics: [],
      recentMessages: context.recentMessages,
      minSemanticScore: context.retrievalMinScore,
      rerankerEnabled: context.rerankerEnabled,
      liveWebSearchEnabled: context.liveWebSearchEnabled,
      liveWebAllowedDomains: context.liveWebAllowedDomains,
    });
    const chunks = result.knowledgeChunks.slice(0, 6).map((chunk) => ({
      text: chunk.text.slice(0, 1800),
      score: chunk.score,
      source_id: chunk.metadata?.sourceId,
      source_type: chunk.metadata?.sourceType,
      source_url: chunk.metadata?.sourceUrl,
      title: chunk.metadata?.title,
    }));
    return {
      output: { found: chunks.length, facts: chunks, verified: chunks.length > 0 },
      artifacts: {
        ...emptyArtifacts(),
        sources: chunks.map((chunk) => ({
          sourceId: chunk.source_id,
          sourceType: chunk.source_type,
          sourceUrl: chunk.source_url,
          title: chunk.title,
          score: chunk.score,
        })),
      },
    };
  }

  if (name !== "get_order_status") throw new Error("unknown_agent_tool");
  const args = OrderArgs.parse(rawArguments);
  const lookupText = ["stato ordine", args.order_number ? `#${args.order_number}` : null, args.email].filter(Boolean).join(" ");
  const result = await tryVerifiedOrderLookup({
    botId: context.botId,
    text: lookupText,
    previousAssistantText: context.previousAssistantText,
    rateLimitScope: context.rateLimitScope,
  });
  return {
    output: {
      handled: result.handled,
      verified: Boolean(result.verified),
      capability: result.capability || "unavailable",
      message: result.response || "Tracking ordine non disponibile.",
      order: result.orderStatusCard || null,
      requires_secure_form: Boolean(result.orderLookupForm),
      handoff: Boolean(result.handoff),
    },
    artifacts: {
      ...emptyArtifacts(),
      orderStatusCard: result.orderStatusCard,
      orderLookupForm: Boolean(result.orderLookupForm),
      persistedResponse: result.persistedResponse,
      handoff: Boolean(result.handoff),
    },
  };
}
