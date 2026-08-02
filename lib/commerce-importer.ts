import "server-only";

import { prisma } from "./db";
import type { ExtractedProduct } from "./product-extractor";

export async function persistExtractedProducts(
  botId: string,
  baseUrl: string,
  rawProducts: ExtractedProduct[],
  options: { sourceType?: string; sourceName?: string } = {},
) {
  const products = [...new Map(rawProducts.map((product) => [product.identityKey, product])).values()];
  if (products.length === 0) return { created: 0, updated: 0, failed: 0 };

  let source = await prisma.productSource.findFirst({
    where: { botId, sourceType: options.sourceType || "jsonld", baseUrl },
  });
  source ??= await prisma.productSource.create({
    data: { botId, sourceType: options.sourceType || "jsonld", name: options.sourceName || `Crawler: ${new URL(baseUrl).hostname}`, baseUrl },
  });
  const job = await prisma.productSyncJob.create({
    data: {
      botId,
      sourceId: source.id,
      status: "running",
      productsSeen: products.length,
      startedAt: new Date(),
      attempts: 1,
    },
  });

  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const candidate of products) {
    try {
      const existing = await prisma.product.findUnique({
        where: { botId_canonicalUrl: { botId, canonicalUrl: candidate.canonicalUrl } },
        select: { id: true },
      });
      const product = await prisma.product.upsert({
        where: { botId_canonicalUrl: { botId, canonicalUrl: candidate.canonicalUrl } },
        create: {
          botId,
          sourceId: source.id,
          identityKey: candidate.identityKey,
          externalId: candidate.externalId,
          canonicalUrl: candidate.canonicalUrl,
          title: candidate.title,
          description: candidate.description,
          brand: candidate.brand,
          productType: candidate.productType,
          categories: JSON.stringify(candidate.categories),
          tags: JSON.stringify(candidate.tags || []),
          mainImageUrl: candidate.mainImageUrl,
          imageUrls: JSON.stringify(candidate.imageUrls),
          availableForSale: candidate.availableForSale,
          lastSyncedAt: new Date(),
          metadata: JSON.stringify(candidate.metadata),
        },
        update: {
          sourceId: source.id,
          identityKey: candidate.identityKey,
          externalId: candidate.externalId,
          title: candidate.title,
          description: candidate.description,
          brand: candidate.brand,
          productType: candidate.productType,
          categories: JSON.stringify(candidate.categories),
          tags: JSON.stringify(candidate.tags || []),
          mainImageUrl: candidate.mainImageUrl,
          imageUrls: JSON.stringify(candidate.imageUrls),
          availableForSale: candidate.availableForSale,
          lastSyncedAt: new Date(),
          metadata: JSON.stringify(candidate.metadata),
        },
      });
      existing ? updated++ : created++;

      for (const variant of candidate.variants) {
        await prisma.productVariant.upsert({
          where: { productId_identityKey: { productId: product.id, identityKey: variant.identityKey } },
          create: {
            productId: product.id,
            identityKey: variant.identityKey,
            externalId: variant.externalId,
            sku: variant.sku,
            title: variant.title,
            attributes: JSON.stringify(variant.attributes),
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            currency: variant.currency,
            available: variant.available,
            stockQuantity: variant.stockQuantity,
            productUrl: variant.productUrl,
            imageUrl: variant.imageUrl,
          },
          update: {
            externalId: variant.externalId,
            sku: variant.sku,
            title: variant.title,
            attributes: JSON.stringify(variant.attributes),
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            currency: variant.currency,
            available: variant.available,
            stockQuantity: variant.stockQuantity,
            productUrl: variant.productUrl,
            imageUrl: variant.imageUrl,
          },
        });
      }
    } catch (error) {
      failed++;
      console.error(`[Commerce] Failed to import ${candidate.canonicalUrl}:`, error);
    }
  }

  const status = failed === products.length ? "failed" : "completed";
  await prisma.$transaction([
    prisma.productSyncJob.update({
      where: { id: job.id },
      data: {
        status,
        progress: 100,
        productsCreated: created,
        productsUpdated: updated,
        productsFailed: failed,
        completedAt: new Date(),
        errorMessage: failed ? `${failed} prodotti non importati` : null,
      },
    }),
    prisma.productSource.update({
      where: { id: source.id },
      data: {
        status: status === "failed" ? "error" : "active",
        lastSyncAt: new Date(),
        lastError: failed ? `${failed} prodotti non importati` : null,
      },
    }),
  ]);

  return { created, updated, failed };
}
