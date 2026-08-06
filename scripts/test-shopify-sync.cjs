const assert = require("node:assert/strict");
const Module = require("node:module");

const connection = { id: "connection-1", botId: "bot-1", enabled: true };
let imported;
let connectionUpdate;
let retiredProductUpdate;
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "./db") return { prisma: { integrationConnection: {
    findUnique: async () => connection,
    update: async (input) => { connectionUpdate = input; return connection; },
  }, product: {
    updateMany: async (input) => { retiredProductUpdate = input; return { count: 1 }; },
  } } };
  if (request === "./url-safety") return { assertSafeRemoteUrl: async (value) => new URL(value) };
  if (request === "./commerce-importer") return { persistExtractedProducts: async (...args) => { imported = args; return { created: 1, updated: 0, failed: 0 }; } };
  if (request === "./shopify-auth") return {
    ensureShopifyAccessToken: async () => ({ token: "test-token", config: { shopUrl: "https://shop.example.com" } }),
    SHOPIFY_API_VERSION: "2026-07",
    shopifyEnvironment: () => ({ ready: true, webhookUrl: "https://app.example.com/api/shopify/webhooks" }),
  };
  if (request === "./secret-config") return { decryptConfigSecrets: (value) => value };
  return originalLoad.call(this, request, parent, isMain);
};

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
require("ts-node/register/transpile-only");

let continuationAttempts = 0;
global.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  if (body.query.includes("query ProductVariants")) {
    continuationAttempts += 1;
    if (continuationAttempts === 1) {
      return new Response(JSON.stringify({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    }
    return Response.json({ data: { product: { variants: {
      nodes: [{ id: "gid://shopify/ProductVariant/2", title: "44", sku: "LORD-44", price: "59.99", availableForSale: false, inventoryQuantity: 0, selectedOptions: [{ name: "Taglia", value: "44" }], image: null }],
      pageInfo: { hasNextPage: false, endCursor: null },
    } } } });
  }
  return Response.json({ data: {
    shop: { currencyCode: "EUR" },
    products: {
      nodes: [{
        id: "gid://shopify/Product/1", title: "Pantalone Lord Nero", description: "Pantalone uomo", vendor: "Suddenly", productType: "Pantaloni", tags: ["uomo"], handle: "pantalone-lord-nero", status: "ACTIVE", onlineStoreUrl: "https://shop.example.com/products/pantalone-lord-nero",
        featuredMedia: { preview: { image: { url: "https://cdn.example.com/lord.jpg" } } }, media: { nodes: [] },
        variants: {
          nodes: [{ id: "gid://shopify/ProductVariant/1", title: "42", sku: "LORD-42", price: "59.99", availableForSale: true, inventoryQuantity: 3, selectedOptions: [{ name: "Taglia", value: "42" }], image: null }],
          pageInfo: { hasNextPage: true, endCursor: "variant-cursor-1" },
        },
      }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  } });
};

const { syncCommercePlatform } = require("../lib/commerce-platform-sync.ts");
const { processShopifyWebhook } = require("../lib/shopify-webhooks.ts");

syncCommercePlatform(connection.botId, "shopify").then(async (result) => {
  assert.deepEqual(result, { created: 1, updated: 0, failed: 0 });
  assert.equal(continuationAttempts, 2, "Il rate limit Shopify deve essere ritentato");
  assert.equal(imported[2][0].variants.length, 2, "Tutte le pagine varianti devono essere importate");
  assert.deepEqual(imported[2][0].variants.map((variant) => [variant.attributes.Taglia, variant.available]), [["42", true], ["44", false]]);
  assert.equal(imported[3].reconcileVariants, true);
  assert.equal(imported[3].authoritativeSnapshot, true);
  assert.equal(connectionUpdate.data.status, "connected");
  const retired = await processShopifyWebhook(
    { ...connection, externalAccountId: "shop.myshopify.com" },
    "products/update",
    { id: 10, status: "draft", published_at: null },
  );
  assert.deepEqual(retired, { retired: 1 });
  assert.equal(retiredProductUpdate.data.status, "deleted");
  assert.equal(retiredProductUpdate.data.availableForSale, false);
  console.log(JSON.stringify({ success: true, checks: 10 }));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
