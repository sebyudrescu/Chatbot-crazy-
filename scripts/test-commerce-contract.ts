import assert from "node:assert/strict";
import {
  pageContextMatchesOrigin,
  pageContextSchema,
  productCardsSchema,
  safeHttpsUrl,
} from "../lib/commerce-types";
import { buildVerifiedProductResponse } from "../lib/verified-product-response";

const card = productCardsSchema.parse([{
  productId: "1ea40bf7-05da-4d6c-b7a8-0e919dc6c2ee",
  title: "Scarpa verificata",
  imageUrl: "https://shop.example.com/images/shoe.jpg",
  productUrl: "https://shop.example.com/products/shoe",
  price: 89.9,
  currency: "EUR",
  availability: "in_stock",
  reason: "Adatta alla richiesta",
  actions: [{ type: "view", label: "Vedi prodotto", url: "https://shop.example.com/products/shoe" }],
}]);
assert.equal(card.length, 1);
assert.equal(safeHttpsUrl("javascript:alert(1)"), undefined);
assert.equal(safeHttpsUrl("http://shop.example.com/product"), undefined);

const context = pageContextSchema.parse({
  url: "https://shop.example.com/products/shoe",
  title: "Scarpa",
  language: "it-IT",
  recentPages: [{ url: "https://shop.example.com/collections/sport" }],
});
assert.equal(pageContextMatchesOrigin(context, "https://shop.example.com"), true);
assert.equal(pageContextMatchesOrigin(context, "https://evil.example"), false);

const verifiedResponse = buildVerifiedProductResponse(card);
assert.match(verifiedResponse, /Scarpa verificata/);
assert.match(verifiedResponse, /89,90\s€/);
assert.match(verifiedResponse, /https:\/\/shop\.example\.com\/products\/shoe/);
assert.doesNotMatch(verifiedResponse, /collection/i);

assert.throws(() => productCardsSchema.parse([{
  productId: "1ea40bf7-05da-4d6c-b7a8-0e919dc6c2ee",
  title: "Prodotto falso",
  productUrl: "javascript:alert(1)",
  availability: "in_stock",
  actions: [],
}]));

console.log("Commerce contract tests passed");
