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
const { hasVerifiedProductSource, searchVerifiedProducts } = require("../lib/product-search.ts");
const { hydrateProductCards } = require("../lib/commerce-catalog.ts");
const { finalizeAuthoritativeSnapshot, persistExtractedProducts } = require("../lib/commerce-importer.ts");
const {
  enqueueCommerceSync,
  processCommerceSyncJob,
  recoverStaleCommerceSyncJobs,
} = require("../lib/commerce-sync-queue.ts");

async function main() {
  const bot = await prisma.chatbot.create({ data: { workspaceId: "00000000-0000-4000-8000-000000000001", companyName: "Commerce E2E Test", kbStatus: "ready" } });
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
    assert.equal(await hasVerifiedProductSource(bot.id), true);

    const typoSearch = await searchVerifiedProducts(bot.id, "Che scrapa hai?");
    assert.equal(typoSearch.selections.length, 1, "Un refuso nella categoria deve ancora interrogare il catalogo verificato");
    assert.equal(typoSearch.selections[0].productId, product.id);

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
    const movedBagUrl = "https://catalog.example.com/products/bag-new-domain";
    const movedBag = { ...bagCandidate, canonicalUrl: movedBagUrl, variants: bagCandidate.variants.map((variant) => ({ ...variant, productUrl: movedBagUrl })) };
    assert.deepEqual(
      await persistExtractedProducts(bot.id, "https://catalog.example.com", [movedBag]),
      { created: 0, updated: 1, failed: 0 },
      "Un prodotto con identità stabile e URL cambiato deve essere aggiornato, non duplicato",
    );
    assert.equal(await prisma.product.count({ where: { botId: bot.id, identityKey: bagCandidate.identityKey } }), 1);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: importedBag.id } })).canonicalUrl, movedBagUrl);
    bagCandidate.canonicalUrl = movedBagUrl;
    bagCandidate.variants[0].productUrl = movedBagUrl;
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

    const wooSource = await prisma.productSource.create({
      data: { botId: bot.id, sourceType: "woocommerce", name: "Woo test", baseUrl: "https://woo.example.com" },
    });
    const possiblyMissing = await prisma.product.create({
      data: {
        botId: bot.id,
        sourceId: wooSource.id,
        identityKey: "woocommerce:missing-twice",
        canonicalUrl: "https://woo.example.com/product/missing-twice",
        title: "Possibile assenza temporanea",
        lastSyncedAt: new Date("2026-08-01T00:00:00Z"),
      },
    });
    await finalizeAuthoritativeSnapshot(bot.id, wooSource.id, new Date("2026-08-02T00:00:00Z"));
    const firstMiss = await prisma.product.findUniqueOrThrow({ where: { id: possiblyMissing.id } });
    assert.equal(firstMiss.status, "active", "Una singola assenza non deve ritirare un prodotto durante paginazione concorrente");
    assert.equal(firstMiss.missingSyncCount, 1);
    await finalizeAuthoritativeSnapshot(bot.id, wooSource.id, new Date("2026-08-02T00:00:00Z"));
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: possiblyMissing.id } })).missingSyncCount, 1, "Il retry dello stesso snapshot deve essere idempotente");
    await finalizeAuthoritativeSnapshot(bot.id, wooSource.id, new Date("2026-08-03T00:00:00Z"));
    const confirmedMissing = await prisma.product.findUniqueOrThrow({ where: { id: possiblyMissing.id } });
    assert.equal(confirmedMissing.status, "deleted", "Due snapshot completi devono confermare il ritiro del prodotto");
    assert.equal(confirmedMissing.availableForSale, false);

    await prisma.integrationConnection.create({
      data: {
        botId: bot.id,
        provider: "shopify",
        category: "commerce",
        displayName: "Shopify",
        externalAccountId: "queue-test.myshopify.com",
        config: "{}",
        status: "connected",
        enabled: true,
      },
    });
    const [firstQueued, duplicateQueued] = await Promise.all([
      enqueueCommerceSync(bot.id, "shopify"),
      enqueueCommerceSync(bot.id, "shopify"),
    ]);
    assert.equal(firstQueued.job.id, duplicateQueued.job.id, "Due enqueue concorrenti devono riutilizzare lo stesso job");
    assert.equal(Number(firstQueued.reused) + Number(duplicateQueued.reused), 1);
    let runnerCalls = 0;
    const completedQueueJob = await processCommerceSyncJob(firstQueued.job.id, async (botId, provider, options) => {
      runnerCalls += 1;
      assert.equal(botId, bot.id);
      assert.equal(provider, "shopify");
      assert.equal(options.jobLeaseVersion, 1);
      await options.onProgress(60, "Catalogo di test");
      return { created: 2, updated: 3, failed: 0 };
    });
    assert.equal(runnerCalls, 1);
    assert.equal(completedQueueJob.status, "completed");
    assert.equal(completedQueueJob.progress, 100);
    assert.equal(completedQueueJob.productsCreated, 2);
    assert.equal(completedQueueJob.productsUpdated, 3);
    assert.equal(completedQueueJob.attempts, 0, "Una tranche riuscita non deve consumare tentativi di errore");

    const continuationQueued = await enqueueCommerceSync(bot.id, "shopify");
    const firstSlice = await processCommerceSyncJob(continuationQueued.job.id, async (_botId, _provider, options) => {
      assert.equal(options.jobLeaseVersion, 1);
      return { created: 1, updated: 0, failed: 0, continuation: true };
    });
    assert.equal(firstSlice.status, "pending", "Un catalogo grande deve restare riprendibile tra due invocazioni");
    assert.equal(firstSlice.attempts, 0);
    const secondSlice = await processCommerceSyncJob(continuationQueued.job.id, async (_botId, _provider, options) => {
      assert.equal(options.jobLeaseVersion, 2, "Ogni ripresa deve avere un nuovo fencing token");
      return { created: 1, updated: 0, failed: 0 };
    });
    assert.equal(secondSlice.status, "completed");

    const retryQueued = await enqueueCommerceSync(bot.id, "shopify");
    assert.notEqual(retryQueued.job.id, continuationQueued.job.id, "Un job completato non deve bloccare una nuova sincronizzazione");
    const retried = await processCommerceSyncJob(retryQueued.job.id, async () => { throw new Error("Errore temporaneo test"); });
    assert.equal(retried.status, "pending");
    assert.equal(retried.attempts, 1);
    assert.ok(retried.nextRetryAt instanceof Date);
    await prisma.productSyncJob.update({
      where: { id: retryQueued.job.id },
      data: { status: "running", startedAt: new Date(Date.now() - 10 * 60 * 1_000), nextRetryAt: null },
    });
    assert.ok(await recoverStaleCommerceSyncJobs() >= 1);
    const recovered = await prisma.productSyncJob.findUniqueOrThrow({ where: { id: retryQueued.job.id } });
    assert.equal(recovered.status, "pending", "Un worker interrotto deve tornare automaticamente in coda");

    console.log(JSON.stringify({ success: true, checks: ["migration", "catalog-write", "price-filter", "blocked-product", "server-hydration", "add-to-cart", "sync-job", "stable-identity-url-migration", "variant-reconciliation", "product-retirement", "product-reactivation", "source-isolation", "empty-snapshot", "two-snapshot-retirement", "queue-deduplication", "lease-fencing", "checkpoint-continuation", "queue-progress", "queue-retry", "stale-worker-recovery"] }));
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
