const assert = require("node:assert/strict");
const Module = require("node:module");

const connection = {
  id: "woo-connection-1",
  botId: "bot-1",
  enabled: true,
  config: JSON.stringify({
    storeUrl: "https://woo.example.com",
    consumerKey: "ck_test",
    consumerSecret: "cs_test",
  }),
};
const syncJob = {
  id: "woo-job-1", botId: "bot-1", sourceId: "woo-source-1", status: "running", leaseVersion: 4,
  checkpoint: null, snapshotStartedAt: new Date("2026-08-06T00:00:00Z"), startedAt: new Date(), createdAt: new Date(),
  pagesProcessed: 0, productsSeen: 0, productsCreated: 0, productsUpdated: 0, productsFailed: 0,
};
const importedPages = [];
const connectionUpdates = [];
let finalized = 0;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "./db") return { prisma: {
    integrationConnection: {
      findUnique: async () => connection,
      update: async (input) => { connectionUpdates.push(input); return connection; },
    },
    productSyncJob: {
      findFirst: async () => syncJob,
      findUniqueOrThrow: async () => syncJob,
      updateMany: async ({ data }) => {
        for (const [key, value] of Object.entries(data)) {
          syncJob[key] = value && typeof value === "object" && "increment" in value
            ? syncJob[key] + value.increment
            : value;
        }
        return { count: 1 };
      },
    },
  } };
  if (request === "./url-safety") return { assertSafeRemoteUrl: async (value) => new URL(value) };
  if (request === "./commerce-importer") return {
    persistExtractedProducts: async (_botId, _origin, products, options) => {
      importedPages.push({ products, options });
      return { created: products.length, updated: 0, failed: 0 };
    },
    finalizeAuthoritativeSnapshot: async () => { finalized += 1; return 0; },
  };
  if (request === "./shopify-auth") return { ensureShopifyAccessToken: async () => { throw new Error("not used"); } };
  if (request === "./secret-config") return { decryptConfigSecrets: (value) => value };
  return originalLoad.call(this, request, parent, isMain);
};

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
require("ts-node/register/transpile-only");

let firstProductRequest = true;
let rateLimitRetries = 0;
global.fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.match(String(init.headers.Authorization), /^Basic /);
  if (url.pathname.endsWith("/data/currencies/current")) return Response.json({ code: "EUR" });

  const variationMatch = url.pathname.match(/\/products\/(\d+)\/variations$/);
  if (variationMatch) {
    const page = Number(url.searchParams.get("page"));
    const variation = page === 1
      ? { id: 101, status: "publish", sku: "SHIRT-S", price: "39.90", regular_price: "49.90", purchasable: true, stock_status: "instock", stock_quantity: 3, permalink: "https://woo.example.com/product/shirt/?attribute_size=S", image: { src: "https://woo.example.com/s.jpg" }, attributes: [{ name: "Taglia", option: "S" }] }
      : { id: 102, status: "publish", sku: "SHIRT-M", price: "39.90", regular_price: "49.90", purchasable: false, stock_status: "outofstock", stock_quantity: 0, permalink: "https://woo.example.com/product/shirt/?attribute_size=M", image: { src: "https://woo.example.com/m.jpg" }, attributes: [{ name: "Taglia", option: "M" }] };
    return Response.json([variation], { headers: { "x-wp-totalpages": "2" } });
  }

  if (url.pathname.endsWith("/products")) {
    const page = Number(url.searchParams.get("page"));
    if (page === 1 && firstProductRequest) {
      firstProductRequest = false;
      rateLimitRetries += 1;
      return Response.json({ message: "Too many requests" }, { status: 429 });
    }
    const variable = page === 1;
    return Response.json([{
      id: page,
      name: variable ? "Camicia lino" : `Prodotto ${page}`,
      type: variable ? "variable" : "simple",
      status: "publish",
      permalink: variable ? "https://woo.example.com/product/shirt/" : `https://woo.example.com/product/${page}/`,
      description: "<p>Descrizione verificata</p>",
      short_description: "",
      sku: variable ? "" : `SKU-${page}`,
      price: variable ? "" : String(10 + page),
      regular_price: variable ? "" : String(12 + page),
      purchasable: true,
      stock_status: "instock",
      stock_quantity: 5,
      images: [{ src: `https://woo.example.com/${page}.jpg` }],
      categories: [{ name: "Abbigliamento" }],
      tags: [{ name: "estate" }],
      brands: [{ name: "LitX" }],
    }], { headers: { "x-wp-totalpages": "4", "x-wp-total": "4" } });
  }
  throw new Error(`Unexpected WooCommerce URL: ${url}`);
};

const { syncCommercePlatform } = require("../lib/commerce-platform-sync.ts");

syncCommercePlatform(connection.botId, "woocommerce", { jobId: syncJob.id, jobLeaseVersion: 4 }).then(async (first) => {
  assert.equal(first.continuation, true);
  assert.equal(rateLimitRetries, 1, "Il rate limit WooCommerce deve essere ritentato");
  assert.equal(syncJob.pagesProcessed, 3);
  assert.equal(syncJob.checkpoint, "woo:4");
  assert.equal(importedPages.length, 3);
  assert.equal(importedPages[0].products[0].variants.length, 2, "Tutte le pagine varianti devono essere importate");
  assert.deepEqual(importedPages[0].products[0].variants.map((variant) => [variant.attributes.Taglia, variant.available]), [["S", true], ["M", false]]);
  assert.equal(importedPages[0].products[0].variants[0].currency, "EUR");
  assert.match(importedPages[0].products[0].variants[0].productUrl, /attribute_size=S/);
  assert.equal(importedPages[0].options.reconcileVariants, true);
  assert.equal(connectionUpdates.at(-1).data.status, "syncing");

  const final = await syncCommercePlatform(connection.botId, "woocommerce", { jobId: syncJob.id, jobLeaseVersion: 4 });
  assert.equal(final.continuation, undefined);
  assert.equal(syncJob.pagesProcessed, 4);
  assert.equal(syncJob.checkpoint, "__snapshot_complete__");
  assert.equal(finalized, 1, "La riconciliazione deve avvenire solo dopo l'ultima pagina");
  assert.equal(connectionUpdates.at(-1).data.status, "connected");
  console.log(JSON.stringify({ success: true, checks: 17 }));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
