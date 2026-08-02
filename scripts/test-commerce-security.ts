import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createShopifyOAuthState,
  normalizeShopDomain,
  verifyShopifyOAuthHmac,
  verifyShopifyOAuthState,
  verifyShopifyWebhookHmac,
} from "../lib/shopify-signatures";
import {
  signCommerceConversion,
  verifyCommerceConversionSignature,
} from "../lib/commerce-conversion-signatures";
import {
  createWooCommerceOAuthState,
  verifyWooCommerceOAuthState,
  verifyWooCommerceWebhookHmac,
} from "../lib/woocommerce-signatures";
import {
  parseOrderLookupMessage,
  presentVerifiedWooOrder,
  redactOrderLookupMessage,
} from "../lib/woocommerce-order-tracking-contract";

const secret = "shopify-client-secret-for-security-tests";
const now = 1_800_000_000_000;

assert.equal(normalizeShopDomain("https://demo-store.myshopify.com/admin"), "demo-store.myshopify.com");
assert.equal(normalizeShopDomain("demo-store.myshopify.com"), "demo-store.myshopify.com");
assert.equal(normalizeShopDomain("demo-store.myshopify.com.evil.test"), null);
assert.equal(normalizeShopDomain("https://localhost"), null);

const state = createShopifyOAuthState("4280af74-f788-45ac-855a-feae6f899791", "demo-store.myshopify.com", secret, now);
assert.equal(verifyShopifyOAuthState(state, secret, now + 1_000)?.shop, "demo-store.myshopify.com");
assert.equal(verifyShopifyOAuthState(`${state}x`, secret, now), null);
assert.equal(verifyShopifyOAuthState(state, secret, now + 11 * 60 * 1000), null);

const params = new URLSearchParams({ code: "oauth-code", shop: "demo-store.myshopify.com", state, timestamp: "1800000000" });
const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
params.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));
assert.equal(verifyShopifyOAuthHmac(params, secret), true);
params.set("shop", "attacker.myshopify.com");
assert.equal(verifyShopifyOAuthHmac(params, secret), false);

const webhookBody = JSON.stringify({ id: 123, title: "Prodotto" });
const webhookSignature = createHmac("sha256", secret).update(webhookBody).digest("base64");
assert.equal(verifyShopifyWebhookHmac(webhookBody, webhookSignature, secret), true);
assert.equal(verifyShopifyWebhookHmac(`${webhookBody} `, webhookSignature, secret), false);

const conversionBody = JSON.stringify({ eventType: "conversion", externalEventId: "order-123", value: 99, currency: "EUR" });
const timestamp = String(Math.floor(now / 1000));
const signature = signCommerceConversion(conversionBody, timestamp, secret);
assert.equal(verifyCommerceConversionSignature(conversionBody, timestamp, signature, secret, now), true);
assert.equal(verifyCommerceConversionSignature(conversionBody, timestamp, signature, "wrong-secret", now), false);
assert.equal(verifyCommerceConversionSignature(conversionBody, timestamp, signature, secret, now + 6 * 60 * 1000), false);

const wooState = createWooCommerceOAuthState("4280af74-f788-45ac-855a-feae6f899791", "https://shop.example.com", secret, now);
assert.equal(verifyWooCommerceOAuthState(wooState, secret, now + 1_000)?.storeOrigin, "https://shop.example.com");
assert.equal(verifyWooCommerceOAuthState(`${wooState}x`, secret, now), null);
assert.equal(verifyWooCommerceOAuthState(wooState, secret, now + 16 * 60 * 1000), null);
const wooWebhookSignature = createHmac("sha256", secret).update(webhookBody).digest("base64");
assert.equal(verifyWooCommerceWebhookHmac(webhookBody, wooWebhookSignature, secret), true);
assert.equal(verifyWooCommerceWebhookHmac(`${webhookBody} `, wooWebhookSignature, secret), false);

const lookup = parseOrderLookupMessage("Dov'è il mio ordine #WC-123? Email Cliente@Example.com");
assert.equal(lookup.hasIntent, true);
assert.equal(lookup.orderNumber, "WC-123");
assert.equal(lookup.email, "cliente@example.com");
assert.equal(redactOrderLookupMessage("Ordine WC-123 cliente@example.com", lookup), "[Dati di verifica ordine rimossi automaticamente]");
assert.equal(parseOrderLookupMessage("La sede dove si trova?").hasIntent, false);
assert.equal(parseOrderLookupMessage("#777 cliente@example.com", "Inviami numero d’ordine ed email").hasIntent, true);
const presented = presentVerifiedWooOrder({
  id: 123,
  number: "WC-123",
  status: "processing",
  total: "49.90",
  currency: "EUR",
  billing: { email: "cliente@example.com" },
  shipping_lines: [{ method_title: "Corriere espresso" }],
  meta_data: [{ key: "_tracking_number", value: "TRACK-123" }, { key: "tracking_url", value: "https://carrier.example/track/TRACK-123" }],
});
assert.match(presented, /Ordine #WC-123/);
assert.match(presented, /TRACK-123/);
assert.doesNotMatch(presented, /cliente@example\.com/);

console.log("Commerce security tests passed");
