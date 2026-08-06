const assert = require("node:assert/strict");
const Module = require("node:module");

const connection = { id: "connection-1", botId: "bot-1", enabled: true };
let imported;
let connectionUpdate;
let retiredProductUpdate;
let resumable = false;
let finalizedSnapshot = 0;
const syncJob = {
  id: "job-1", botId: "bot-1", sourceId: "source-1", status: "running", leaseVersion: 7,
  checkpoint: null, snapshotStartedAt: new Date("2026-08-06T00:00:00Z"), startedAt: new Date(), createdAt: new Date(),
  pagesProcessed: 0, productsSeen: 0, productsCreated: 0, productsUpdated: 0, productsFailed: 0,
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "./db") return { prisma: { integrationConnection: {
    findUnique: async () => connection,
    update: async (input) => { connectionUpdate = input; return connection; },
  }, product: {
    updateMany: async (input) => { retiredProductUpdate = input; return { count: 1 }; },
  }, productSyncJob: {
    findFirst: async () => syncJob,
    findUniqueOrThrow: async () => syncJob,
    updateMany: async ({ data }) => {
      for (const [key, value] of Object.entries(data)) {
        syncJob[key] = value && typeof value === "object" && "increment" in value ? syncJob[key] + value.increment : value;
      }
      return { count: 1 };
    },
  } } };
  if (request === "./url-safety") return { assertSafeRemoteUrl: async (value) => new URL(value) };
  if (request === "./commerce-importer") return {
    persistExtractedProducts: async (...args) => { imported = args; return { created: 1, updated: 0, failed: 0 }; },
    finalizeAuthoritativeSnapshot: async () => { finalizedSnapshot += 1; return 0; },
  };
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
  if (resumable) {
    const page = body.variables.cursor ? Number(String(body.variables.cursor).replace("cursor-", "")) + 1 : 1;
    const hasNextPage = page < 4;
    return Response.json({ data: {
      shop: { currencyCode: "EUR" },
      products: {
        nodes: [{
          id: `gid://shopify/Product/${page}`, title: `Prodotto ${page}`, description: "Test", vendor: "LitX", productType: "Test", tags: [], status: "ACTIVE",
          onlineStoreUrl: `https://shop.example.com/products/prodotto-${page}`,
          featuredMedia: { preview: { image: { url: `https://cdn.example.com/${page}.jpg` } } }, media: { nodes: [] },
          variants: { nodes: [{ id: `gid://shopify/ProductVariant/${page}`, title: "Default", price: "10", availableForSale: true, inventoryQuantity: 1, selectedOptions: [], image: null }], pageInfo: { hasNextPage: false, endCursor: null } },
        }],
        pageInfo: { hasNextPage, endCursor: hasNextPage ? `cursor-${page}` : null },
      },
    } });
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
  resumable = true;
  const firstSlice = await syncCommercePlatform(connection.botId, "shopify", { jobId: syncJob.id, jobLeaseVersion: 7 });
  assert.equal(firstSlice.continuation, true, "La prima invocazione deve fermarsi a un limite sicuro di pagine");
  assert.equal(syncJob.pagesProcessed, 3);
  assert.equal(syncJob.checkpoint, "cursor-3");
  const finalSlice = await syncCommercePlatform(connection.botId, "shopify", { jobId: syncJob.id, jobLeaseVersion: 7 });
  assert.equal(finalSlice.continuation, undefined);
  assert.equal(syncJob.pagesProcessed, 4);
  assert.equal(syncJob.checkpoint, "__snapshot_complete__");
  assert.equal(finalizedSnapshot, 1, "Lo snapshot deve essere riconciliato solo dopo l'ultima pagina");
  const retired = await processShopifyWebhook(
    { ...connection, externalAccountId: "shop.myshopify.com" },
    "products/update",
    { id: 10, status: "draft", published_at: null },
  );
  assert.deepEqual(retired, { retired: 1 });
  assert.equal(retiredProductUpdate.data.status, "deleted");
  assert.equal(retiredProductUpdate.data.availableForSale, false);
  console.log(JSON.stringify({ success: true, checks: 16 }));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
