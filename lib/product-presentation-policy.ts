import type { CommerceIntent } from "./commerce-query";

export interface ProductPresentationCandidate {
  product_id: string;
  variant_id?: string | null;
  title: string;
}

const PRESENTABLE_INTENTS = new Set<CommerceIntent>([
  "product_discovery",
  "product_comparison",
]);

const NON_PRODUCT_INTENTS = new Set<CommerceIntent>([
  "returns_policy",
  "shipping_policy",
  "order_tracking",
  "prompt_injection",
]);

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleIsMentioned(response: string, title: string) {
  const normalizedResponse = normalize(response);
  const normalizedTitle = normalize(title);
  if (!normalizedResponse || !normalizedTitle) return false;
  if (normalizedResponse.includes(normalizedTitle)) return true;

  const words = normalizedTitle.split(" ").filter(Boolean);
  if (words.length < 2) return false;
  for (let length = Math.min(4, words.length); length >= 2; length -= 1) {
    if (normalizedResponse.includes(words.slice(0, length).join(" "))) return true;
  }
  return false;
}

/**
 * Recovers the visual product surface only when the assistant actually chose
 * and named verified catalogue results in a discovery/comparison answer.
 * This is an artifact boundary, not an intent router: the LLM still decides
 * whether to search and which products to recommend.
 */
export function selectMentionedProductsForPresentation(input: {
  response: string;
  intent: CommerceIntent;
  candidates: ProductPresentationCandidate[];
}) {
  if (!PRESENTABLE_INTENTS.has(input.intent)) return [];

  const unique = new Map<string, ProductPresentationCandidate>();
  for (const candidate of input.candidates) {
    if (!titleIsMentioned(input.response, candidate.title)) continue;
    unique.set(`${candidate.product_id}:${candidate.variant_id || ""}`, candidate);
  }
  return [...unique.values()].slice(0, 5);
}

/**
 * Knowledge/policy turns must never inherit product cards from a stale or
 * mistaken tool call. A configured non-product widget remains possible when
 * no knowledge-base turn occurred.
 */
export function shouldSuppressProductArtifacts(input: {
  intent: CommerceIntent;
  usedKnowledgeBase: boolean;
}) {
  return NON_PRODUCT_INTENTS.has(input.intent)
    || (input.usedKnowledgeBase && !PRESENTABLE_INTENTS.has(input.intent));
}
