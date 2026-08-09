import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeShopifyOrderCard, presentShopifyOrder, matchesShopifyOrderNumber } from "../lib/shopify-order-tracking-contract";

const order = {
  name: "#1048",
  email: "cliente@example.com",
  createdAt: "2026-08-01T09:30:00.000Z",
  updatedAt: "2026-08-08T11:30:00.000Z",
  displayFulfillmentStatus: "PARTIALLY_FULFILLED",
  statusPageUrl: "https://shop.example.com/orders/secure-token",
  lineItems: {
    nodes: [
      { title: "Giacca beige", variantTitle: "M", quantity: 1, image: { url: "https://cdn.example.com/jacket.jpg" } },
      { title: "Pantalone nero", variantTitle: "48", quantity: 2, image: { url: "http://unsafe.example.com/trouser.jpg" } },
    ],
  },
  fulfillments: [
    {
      name: "Pacco 1",
      displayStatus: "IN_TRANSIT",
      estimatedDeliveryAt: "2026-08-12T18:00:00.000Z",
      updatedAt: "2026-08-08T10:00:00.000Z",
      trackingInfo: [{ company: "DHL", number: "DHL-123", url: "https://carrier.example.com/DHL-123" }],
    },
    {
      name: "Pacco 2",
      displayStatus: "DELAYED",
      estimatedDeliveryAt: "2026-08-14T18:00:00.000Z",
      trackingInfo: [{ company: "Unsafe", number: "NO-LINK", url: "javascript:alert(1)" }],
    },
  ],
};

const card = normalizeShopifyOrderCard(order, "Negozio Demo");
assert.equal(card.provider, "shopify");
assert.equal(card.orderNumber, "#1048");
assert.equal(card.items.length, 2);
assert.equal(card.items[1].imageUrl, undefined, "HTTP product images must not reach the card");
assert.equal(card.shipments.length, 2, "separate fulfillments must remain separate");
assert.equal(card.shipments[1].tracking[0].url, undefined, "unsafe tracking URLs must be removed");
assert.equal(card.status.code, "DELAYED", "an attention state must not be hidden by a less urgent shipment");
assert.equal(card.estimatedDeliveryAt, "2026-08-12T18:00:00.000Z", "the earliest verified ETA is shown");
assert.equal(card.actions.length, 2);
assert.equal(card.milestones.length, 5);
assert.equal(matchesShopifyOrderNumber("#1048", "1048"), true);
assert.equal(matchesShopifyOrderNumber("#10480", "1048"), false, "order identifiers must match exactly");

const textFallback = presentShopifyOrder(card);
assert.match(textFallback, /2 spedizioni separate/);
assert.match(textFallback, /DHL-123/);
assert.doesNotMatch(textFallback, /cliente@example\.com/);
assert.doesNotMatch(textFallback, /\b\d{1,3}%\b/, "delivery percentages must never be invented");

const serviceSource = readFileSync("lib/shopify-order-tracking.ts", "utf8");
assert.match(serviceSource, /checkRateLimit/);
assert.match(serviceSource, /safeOrderLookupEqual/);
assert.match(serviceSource, /persistedResponse:\s*PERSISTED_SUCCESS/);
assert.match(serviceSource, /orderTrackingPcdStatus:\s*"required"/);
assert.match(serviceSource, /result\.capability !== "ready"[\s\S]*orderTrackingPcdStatus: "ready"/, "a successful privacy-safe probe must persist PCD readiness even when no order matches");
assert.doesNotMatch(serviceSource, /console\.(?:log|info|warn|error)/, "the lookup service must not log protected order data");

const chatSource = readFileSync("app/api/chat/route.ts", "utf8");
assert.match(chatSource, /content:\s*orderLookup\.persistedResponse\s*\|\|\s*orderLookup\.response/);

const channelSource = readFileSync("lib/channel-message-processor.ts", "utf8");
assert.match(channelSource, /orderLookup\.persistedResponse\s*\|\|\s*orderLookup\.response/);

const widgetSource = readFileSync("public/chatbot-widget.js", "utf8");
assert.match(widgetSource, /function addOrderLookupForm/);
assert.match(widgetSource, /function addOrderStatusCard/);
assert.match(widgetSource, /privateEntry \? '\[Dati ordine inviati in modo protetto\]'/);
assert.match(widgetSource, /toggle\.setAttribute\('aria-expanded'/);
assert.doesNotMatch(widgetSource, /Delivery progress/i, "the widget must not imply an unverified delivery percentage");

console.log("Shopify order tracking tests passed");
