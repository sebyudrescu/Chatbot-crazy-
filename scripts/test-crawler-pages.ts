import assert from "node:assert/strict";
import { canonicalizeCrawledPageUrl, deduplicateCrawledPages, resolveFirecrawlPageUrl } from "../lib/crawler-pages";

const start = "https://shop.example.com/?srsltid=tracking";
assert.equal(resolveFirecrawlPageUrl({ metadata: { sourceURL: "https://shop.example.com/products/lino?utm_source=ads" } }, start), "https://shop.example.com/products/lino");
assert.equal(resolveFirecrawlPageUrl({ sourceURL: "https://shop.example.com/collections/uomo#catalogo" }, start), "https://shop.example.com/collections/uomo");
assert.equal(canonicalizeCrawledPageUrl(undefined, start), "https://shop.example.com/");

const pages = deduplicateCrawledPages([
  { url: "https://shop.example.com/products/lino?utm_campaign=a", title: "Breve", textContent: "breve" },
  { url: "https://shop.example.com/products/lino#details", title: "Completa", textContent: "contenuto più completo" },
  { url: "https://shop.example.com/products/cotone", title: "Cotone", textContent: "cotone" },
], start);
assert.equal(pages.length, 2);
assert.equal(pages.find(page => page.url.endsWith("/products/lino"))?.title, "Completa");

console.log(JSON.stringify({ success: true, checks: 5 }));
