import "server-only";

import { prisma } from "./db";
import { tryShopifyOrderLookup, type ShopifyOrderLookupResult } from "./shopify-order-tracking";
import { tryWooCommerceOrderLookup, type WooOrderLookupResult } from "./woocommerce-order-tracking";
import { parseOrderLookupMessage, redactOrderLookupMessage } from "./woocommerce-order-tracking-contract";

export type OrderLookupResult = Omit<ShopifyOrderLookupResult, "provider"> & {
  provider?: "shopify" | "woocommerce";
};

export async function tryVerifiedOrderLookup(input: {
  botId: string;
  text: string;
  previousAssistantText?: string;
  rateLimitScope: string;
}): Promise<OrderLookupResult> {
  const parsed = parseOrderLookupMessage(input.text, input.previousAssistantText);
  if (!parsed.hasIntent) return { handled: false, redactedUserText: input.text };
  const connections = await prisma.integrationConnection.findMany({
    where: { botId: input.botId, provider: { in: ["shopify", "woocommerce"] }, enabled: true, status: "connected" },
    select: { provider: true },
  });
  const providers = new Set(connections.map((connection) => connection.provider));
  if (providers.has("shopify")) {
    const result = await tryShopifyOrderLookup(input);
    if (result.handled) return result;
  }
  if (providers.has("woocommerce")) {
    const result: WooOrderLookupResult = await tryWooCommerceOrderLookup(input);
    return { ...result, persistedResponse: result.response, provider: "woocommerce" };
  }
  return {
    handled: true,
    redactedUserText: redactOrderLookupMessage(input.text, parsed),
    response: "Non posso verificare l’ordine in tempo reale da questa chat. Ti metto in contatto con un operatore che potrà controllarlo in sicurezza.",
    persistedResponse: "Tracking ordine non disponibile: nessun negozio collegato.",
    verified: false,
    handoff: true,
    capability: "unavailable",
  };
}
