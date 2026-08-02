import assert from "node:assert/strict";
import { extractProductsFromHtml } from "../lib/product-extractor";

const html = `<!doctype html><html><head>
  <link rel="canonical" href="https://shop.example.com/products/scarpa" />
  <script type="application/ld+json">{
    "@context":"https://schema.org",
    "@type":"Product",
    "@id":"shoe-1",
    "name":"Scarpa Running Pro",
    "description":"Scarpa leggera per allenamento quotidiano.",
    "brand":{"@type":"Brand","name":"LitX Sport"},
    "image":["/images/shoe.jpg","javascript:alert(1)"],
    "offers":[
      {"@type":"Offer","sku":"SHOE-BLU-42","price":"89.90","priceCurrency":"eur","availability":"https://schema.org/InStock","url":"/products/scarpa?variant=blu-42"},
      {"@type":"Offer","sku":"SHOE-ROSSA-42","price":"99,90","priceCurrency":"EUR","availability":"https://schema.org/OutOfStock"}
    ]
  }</script>
</head><body></body></html>`;

const products = extractProductsFromHtml(html, "https://shop.example.com/products/scarpa?tracking=1");
assert.equal(products.length, 1);
assert.equal(products[0].title, "Scarpa Running Pro");
assert.equal(products[0].brand, "LitX Sport");
assert.equal(products[0].canonicalUrl, "https://shop.example.com/products/scarpa");
assert.deepEqual(products[0].imageUrls, ["https://shop.example.com/images/shoe.jpg"]);
assert.equal(products[0].variants[0].price, 89.9);
assert.equal(products[0].variants[0].currency, "EUR");
assert.equal(products[0].variants[1].available, false);

const graph = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite","name":"Shop"},{"@type":["Thing","Product"],"name":"Borsa","url":"https://shop.example.com/borsa"}]}</script>`;
assert.equal(extractProductsFromHtml(graph, "https://shop.example.com/borsa").length, 1);
assert.equal(extractProductsFromHtml("<html></html>", "http://unsafe.example.com").length, 0);

console.log("Product extractor tests passed");
