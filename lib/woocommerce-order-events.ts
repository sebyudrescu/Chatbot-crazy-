import type { CommerceAttribution } from "./commerce-attribution";

type ResolvedLineItem = {
  id: string;
  index: number;
  productId?: string;
  variantId?: string;
  value?: number;
};

export function buildWooCommerceOrderEvents(input: {
  botId: string;
  connectionId: string;
  orderId: string;
  eventType: "checkout" | "conversion";
  status: string;
  value?: number;
  currency?: string;
  attribution: CommerceAttribution;
  lineItems: ResolvedLineItem[];
}) {
  const prefix = `woocommerce:${input.connectionId}:order:${input.orderId}:${input.eventType}`;
  const itemRows = input.lineItems.map((item) => ({
    botId: input.botId,
    conversationId: input.attribution.conversationId,
    productId: item.productId,
    variantId: item.variantId,
    eventType: `${input.eventType}_item`,
    externalEventId: `${prefix}:item:${item.id}`,
    sessionId: input.attribution.sessionId,
    value: item.value,
    currency: input.currency,
    metadata: JSON.stringify({
      verified: true,
      source: "woocommerce-webhook",
      orderStatus: input.status,
      attributionStatus: input.attribution.status,
      lineIndex: item.index,
    }),
  }));
  const singleItem = itemRows.length === 1 ? itemRows[0] : null;
  return [{
    botId: input.botId,
    conversationId: input.attribution.conversationId,
    productId: singleItem?.productId,
    variantId: singleItem?.variantId,
    eventType: input.eventType,
    externalEventId: prefix,
    sessionId: input.attribution.sessionId,
    value: input.value,
    currency: input.currency,
    metadata: JSON.stringify({
      verified: true,
      source: "woocommerce-webhook",
      orderStatus: input.status,
      attributionStatus: input.attribution.status,
      lineItemCount: itemRows.length,
      matchedProductCount: itemRows.filter((item) => item.productId).length,
      matchedVariantCount: itemRows.filter((item) => item.variantId).length,
    }),
  }, ...itemRows];
}
