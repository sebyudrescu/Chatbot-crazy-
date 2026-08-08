import "server-only";

import { prisma } from "./db";
import type { ExtractedProduct } from "./product-extractor";

async function mapInBatches<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>,
  afterBatch?: (processed: number, total: number) => Promise<void>,
) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...await Promise.all(items.slice(index, index + size).map(worker)));
    await afterBatch?.(Math.min(index + size, items.length), items.length);
  }
  return results;
}

export async function persistExtractedProducts(
  botId: string,
  baseUrl: string,
  rawProducts: ExtractedProduct[],
  options: {
    sourceType?: string;
    sourceName?: string;
    reconcileVariants?: boolean;
    authoritativeSnapshot?: boolean;
    jobId?: string;
    jobLeaseVersion?: number;
    incrementalJob?: boolean;
    onProgress?: (progress: number, message: string) => Promise<void>;
  } = {},
) {
  const products = [...new Map(rawProducts.map((product) => [product.identityKey, product])).values()];
  if (products.length === 0 && !options.authoritativeSnapshot) return { created: 0, updated: 0, failed: 0 };

  let source = await prisma.productSource.findFirst({
    where: { botId, sourceType: options.sourceType || "jsonld", baseUrl },
  });
  source ??= await prisma.productSource.create({
    data: { botId, sourceType: options.sourceType || "jsonld", name: options.sourceName || `Crawler: ${new URL(baseUrl).hostname}`, baseUrl },
  });
  const job = options.jobId
    ? await prisma.productSyncJob.findFirst({ where: {
        id: options.jobId,
        botId,
        sourceId: source.id,
        status: "running",
        ...(options.jobLeaseVersion !== undefined ? { leaseVersion: options.jobLeaseVersion } : {}),
      } })
    : await prisma.productSyncJob.create({
        data: {
          botId,
          sourceId: source.id,
          status: "running",
          productsSeen: products.length,
          startedAt: new Date(),
          attempts: 1,
        },
      });
  if (!job) throw new Error("Job commerce non valido per la fonte selezionata");
  if (options.jobId) {
    const updatedJob = await prisma.productSyncJob.updateMany({
      where: {
        id: job.id,
        status: "running",
        ...(options.jobLeaseVersion !== undefined ? { leaseVersion: options.jobLeaseVersion } : {}),
      },
      data: options.incrementalJob ? { startedAt: new Date() } : { productsSeen: products.length, progress: 50 },
    });
    if (updatedJob.count !== 1) throw new Error("Lease del job commerce non più valida");
  }

  let lastReportedProgress = 50;
  const outcomes = await mapInBatches(products, 6, async (candidate) => {
    try {
      const existingByIdentity = await prisma.product.findUnique({
        where: { botId_identityKey: { botId, identityKey: candidate.identityKey } },
        select: { id: true },
      });
      const existing = existingByIdentity || await prisma.product.findUnique({
        where: { botId_canonicalUrl: { botId, canonicalUrl: candidate.canonicalUrl } },
        select: { id: true },
      });
      const product = existing
        ? await prisma.product.update({
          where: { id: existing.id },
          data: {
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
            status: "active",
            lastSyncedAt: new Date(),
            missingSyncCount: 0,
            lastMissingSnapshotAt: null,
            metadata: JSON.stringify(candidate.metadata),
          },
        })
        : await prisma.product.create({
          data: {
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
          missingSyncCount: 0,
          lastMissingSnapshotAt: null,
          metadata: JSON.stringify(candidate.metadata),
        },
      });
      await mapInBatches(candidate.variants, 12, (variant) => prisma.productVariant.upsert({
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
            position: variant.position,
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
            position: variant.position,
          },
        }));
      if (options.reconcileVariants) {
        await prisma.productVariant.deleteMany({
          where: {
            productId: product.id,
            ...(candidate.variants.length > 0
              ? { identityKey: { notIn: candidate.variants.map((variant) => variant.identityKey) } }
              : {}),
          },
        });
      }
      return existing ? "updated" as const : "created" as const;
    } catch (error) {
      console.error(`[Commerce] Failed to import ${candidate.canonicalUrl}:`, error);
      return "failed" as const;
    }
  }, async (processed, total) => {
    if (!options.onProgress || options.incrementalJob || total === 0) return;
    const progress = 50 + Math.floor((processed / total) * 40);
    if (progress >= lastReportedProgress + 5 || processed === total) {
      lastReportedProgress = progress;
      await options.onProgress(progress, `Aggiornati ${processed}/${total} prodotti`);
    }
  });
  const created = outcomes.filter((outcome) => outcome === "created").length;
  const updated = outcomes.filter((outcome) => outcome === "updated").length;
  const failed = outcomes.filter((outcome) => outcome === "failed").length;

  if (options.authoritativeSnapshot && failed === 0) {
    await prisma.product.updateMany({
      where: {
        botId,
        sourceId: source.id,
        status: "active",
        ...(products.length > 0
          ? { identityKey: { notIn: products.map((product) => product.identityKey) } }
          : {}),
      },
      data: { status: "deleted", availableForSale: false, lastSyncedAt: new Date() },
    });
  }

  const status = failed > 0 && failed === products.length ? "failed" : "completed";
  if (options.jobId) {
    const fencedUpdate = await prisma.productSyncJob.updateMany({
      where: {
        id: job.id,
        status: "running",
        ...(options.jobLeaseVersion !== undefined ? { leaseVersion: options.jobLeaseVersion } : {}),
      },
      data: options.incrementalJob ? { startedAt: new Date() } : {
        progress: 95,
        productsCreated: created,
        productsUpdated: updated,
        productsFailed: failed,
        errorMessage: failed ? `${failed} prodotti non importati` : null,
      },
    });
    if (fencedUpdate.count !== 1) throw new Error("Lease del job commerce persa durante la riconciliazione");
    if (!options.incrementalJob) await prisma.productSource.update({
      where: { id: source.id },
      data: {
        status: status === "failed" ? "error" : "active",
        lastSyncAt: new Date(),
        lastError: failed ? `${failed} prodotti non importati` : null,
      },
    });
    if (status === "failed") throw new Error(`${failed} prodotti non importati`);
  } else {
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
  }

  return { created, updated, failed };
}

export async function finalizeAuthoritativeSnapshot(
  botId: string,
  sourceId: string,
  snapshotStartedAt: Date,
) {
  await prisma.product.updateMany({
    where: {
      botId,
      sourceId,
      status: "active",
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: snapshotStartedAt } }],
      AND: [{ OR: [{ lastMissingSnapshotAt: null }, { lastMissingSnapshotAt: { lt: snapshotStartedAt } }] }],
    },
    data: { missingSyncCount: { increment: 1 }, lastMissingSnapshotAt: snapshotStartedAt },
  });
  const retired = await prisma.product.updateMany({
    where: { botId, sourceId, status: "active", missingSyncCount: { gte: 2 } },
    data: { status: "deleted", availableForSale: false, lastSyncedAt: new Date() },
  });
  await prisma.productSource.update({
    where: { id: sourceId },
    data: { status: "active", lastSyncAt: new Date(), lastError: null },
  });
  return retired.count;
}
