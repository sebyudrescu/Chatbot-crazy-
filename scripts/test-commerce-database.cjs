const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
require("ts-node/register/transpile-only");

const { prisma } = require("../lib/db.ts");
const { searchVerifiedProducts } = require("../lib/product-search.ts");
const { hydrateProductCards } = require("../lib/commerce-catalog.ts");
const { persistExtractedProducts } = require("../lib/commerce-importer.ts");

async function main() {
  const bot = await prisma.chatbot.create({ data: { companyName: "Commerce E2E Test", kbStatus: "ready" } });
  try {
    const source = await prisma.productSource.create({
      data: { botId: bot.id, sourceType: "shopify", name: "Shopify test", baseUrl: "https://shop.example.com" },
    });
    const product = await prisma.product.create({
      data: {
        botId: bot.id,
        sourceId: source.id,
        identityKey: "shopify:test-shoe",
        externalId: "gid://shopify/Product/100",
        canonicalUrl: "https://shop.example.com/products/running-pro",
        title: "Scarpa Running Pro",
        description: "Scarpa leggera per corsa e allenamento quotidiano.",
        brand: "LitX Sport",
        categories: JSON.stringify(["Running"]),
        tags: JSON.stringify(["scarpa", "sport"]),
        mainImageUrl: "https://shop.example.com/images/running-pro.jpg",
        imageUrls: JSON.stringify(["https://shop.example.com/images/running-pro.jpg"]),
        variants: {
          create: {
            identityKey: "shopify-variant:200",
            externalId: "gid://shopify/ProductVariant/200",
            sku: "RUN-BLU-42",
            title: "Blu / 42",
            price: 89.9,
            compareAtPrice: 109.9,
            currency: "EUR",
            available: true,
            stockQuantity: 4,
            productUrl: "https://shop.example.com/products/running-pro?variant=200",
            imageUrl: "https://shop.example.com/images/running-pro-blue.jpg",
          },
        },
      },
    });

    const search = await searchVerifiedProducts(bot.id, "Consigliami una scarpa running sotto 100 euro");
    assert.equal(search.selections.length, 1);
    assert.equal(search.selections[0].productId, product.id);
    assert.match(search.promptContext, /CATALOGO COMMERCIALE VERIFICATO/);

    const cards = await hydrateProductCards(bot.id, search.selections);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].price, 89.9);
    assert.equal(cards[0].imageUrl, "https://shop.example.com/images/running-pro-blue.jpg");
    assert.equal(cards[0].availability, "in_stock");
    assert.equal(cards[0].actions.some((action) => action.type === "add_to_cart"), true);
    assert.match(cards[0].actions.find((action) => action.type === "add_to_cart").url, /\/cart\/add\?id=200/);

    const tooCheap = await searchVerifiedProducts(bot.id, "Cerco scarpe sotto 50 euro");
    assert.equal(tooCheap.selections.length, 0);
    await prisma.product.update({ where: { id: product.id }, data: { recommendationStatus: "blocked" } });
    const blocked = await searchVerifiedProducts(bot.id, "Mostrami la scarpa Running Pro");
    assert.equal(blocked.selections.length, 0);

    const bagCandidate = {
      identityKey: "jsonld:bag-1",
      externalId: "bag-1",
      canonicalUrl: "https://catalog.example.com/products/bag",
      title: "Borsa City",
      description: "Borsa da città",
      categories: ["Borse"],
      tags: ["city"],
      mainImageUrl: "https://catalog.example.com/images/bag.jpg",
      imageUrls: ["https://catalog.example.com/images/bag.jpg"],
      availableForSale: true,
      variants: [{ identityKey: "jsonld:bag-default", sku: "BAG-1", price: 49, currency: "EUR", available: true, productUrl: "https://catalog.example.com/products/bag", attributes: {} }],
      metadata: { source: "jsonld" },
    };
    const imported = await persistExtractedProducts(bot.id, "https://catalog.example.com", [bagCandidate]);
    assert.deepEqual(imported, { created: 1, updated: 0, failed: 0 });
    assert.equal(await prisma.product.count({ where: { botId: bot.id } }), 2);
    assert.equal(await prisma.productSyncJob.count({ where: { botId: bot.id, status: "completed" } }), 1);

    const importedBag = await prisma.product.findUniqueOrThrow({
      where: { botId_identityKey: { botId: bot.id, identityKey: bagCandidate.identityKey } },
    });
    await prisma.productVariant.create({
      data: {
        productId: importedBag.id,
        identityKey: "jsonld:bag-stale",
        sku: "BAG-OLD",
        price: 59,
        currency: "EUR",
        available: true,
      },
    });
    await prisma.product.create({
      data: {
        botId: bot.id,
        sourceId: importedBag.sourceId,
        identityKey: "jsonld:obsolete-product",
        canonicalUrl: "https://catalog.example.com/products/obsolete",
        title: "Prodotto non piu presente",
      },
    });
    await prisma.product.update({ where: { id: importedBag.id }, data: { status: "deleted", availableForSale: false } });

    await persistExtractedProducts(bot.id, "https://catalog.example.com", [bagCandidate], {
      sourceType: "jsonld",
      reconcileVariants: true,
      authoritativeSnapshot: true,
    });
    assert.equal(await prisma.productVariant.count({ where: { productId: importedBag.id } }), 1, "Le varianti assenti dallo snapshot devono essere eliminate");
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: importedBag.id } })).status, "active", "Un prodotto riapparso deve essere riattivato");
    const obsolete = await prisma.product.findUniqueOrThrow({ where: { botId_identityKey: { botId: bot.id, identityKey: "jsonld:obsolete-product" } } });
    assert.equal(obsolete.status, "deleted", "I prodotti assenti dallo snapshot autorevole devono essere ritirati");
    assert.equal(obsolete.availableForSale, false);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, "active", "Lo snapshot non deve toccare altre fonti catalogo");

    await persistExtractedProducts(bot.id, "https://catalog.example.com", [], {
      sourceType: "jsonld",
      reconcileVariants: true,
      authoritativeSnapshot: true,
    });
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: importedBag.id } })).status, "deleted", "Uno snapshot autorevole vuoto deve ritirare l'intera fonte");
    const latestJob = await prisma.productSyncJob.findFirstOrThrow({ where: { botId: bot.id, sourceId: importedBag.sourceId }, orderBy: { createdAt: "desc" } });
    assert.equal(latestJob.status, "completed", "Uno snapshot vuoto valido non deve essere classificato come errore");

    console.log(JSON.stringify({ success: true, checks: ["migration", "catalog-write", "price-filter", "blocked-product", "server-hydration", "add-to-cart", "sync-job", "variant-reconciliation", "product-retirement", "product-reactivation", "source-isolation", "empty-snapshot"] }));
  } finally {
    await prisma.chatbot.delete({ where: { id: bot.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
