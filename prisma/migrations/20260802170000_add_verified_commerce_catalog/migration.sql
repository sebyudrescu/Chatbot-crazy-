ALTER TABLE "messages"
ADD COLUMN "productCards" TEXT;

CREATE TABLE "product_sources" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "sourceId" TEXT,
  "identityKey" TEXT NOT NULL,
  "externalId" TEXT,
  "canonicalUrl" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "brand" TEXT,
  "productType" TEXT,
  "categories" TEXT NOT NULL DEFAULT '[]',
  "tags" TEXT NOT NULL DEFAULT '[]',
  "mainImageUrl" TEXT,
  "imageUrls" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'active',
  "availableForSale" BOOLEAN NOT NULL DEFAULT true,
  "recommendationStatus" TEXT NOT NULL DEFAULT 'normal',
  "rankingBoost" INTEGER NOT NULL DEFAULT 0,
  "merchandisingNote" TEXT,
  "campaignStart" TIMESTAMP(3),
  "campaignEnd" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "contentHash" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_variants" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "identityKey" TEXT NOT NULL,
  "externalId" TEXT,
  "sku" TEXT,
  "title" TEXT,
  "attributes" TEXT NOT NULL DEFAULT '{}',
  "price" DOUBLE PRECISION,
  "compareAtPrice" DOUBLE PRECISION,
  "currency" TEXT,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "stockQuantity" INTEGER,
  "productUrl" TEXT,
  "imageUrl" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_sync_jobs" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "productsSeen" INTEGER NOT NULL DEFAULT 0,
  "productsCreated" INTEGER NOT NULL DEFAULT 0,
  "productsUpdated" INTEGER NOT NULL DEFAULT 0,
  "productsFailed" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextRetryAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_sync_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commerce_events" (
  "id" TEXT NOT NULL,
  "botId" TEXT NOT NULL,
  "conversationId" TEXT,
  "messageId" TEXT,
  "productId" TEXT,
  "variantId" TEXT,
  "eventType" TEXT NOT NULL,
  "sessionId" TEXT,
  "pageUrl" TEXT,
  "value" DOUBLE PRECISION,
  "currency" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commerce_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_sources_botId_status_idx" ON "product_sources"("botId", "status");
CREATE INDEX "product_sources_sourceType_idx" ON "product_sources"("sourceType");
CREATE UNIQUE INDEX "products_botId_identityKey_key" ON "products"("botId", "identityKey");
CREATE UNIQUE INDEX "products_botId_canonicalUrl_key" ON "products"("botId", "canonicalUrl");
CREATE INDEX "products_botId_status_availableForSale_idx" ON "products"("botId", "status", "availableForSale");
CREATE INDEX "products_botId_recommendationStatus_idx" ON "products"("botId", "recommendationStatus");
CREATE INDEX "products_sourceId_idx" ON "products"("sourceId");
CREATE INDEX "products_externalId_idx" ON "products"("externalId");
CREATE INDEX "products_brand_idx" ON "products"("brand");
CREATE UNIQUE INDEX "product_variants_productId_identityKey_key" ON "product_variants"("productId", "identityKey");
CREATE INDEX "product_variants_productId_available_idx" ON "product_variants"("productId", "available");
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");
CREATE INDEX "product_sync_jobs_botId_status_idx" ON "product_sync_jobs"("botId", "status");
CREATE INDEX "product_sync_jobs_sourceId_createdAt_idx" ON "product_sync_jobs"("sourceId", "createdAt");
CREATE INDEX "product_sync_jobs_nextRetryAt_idx" ON "product_sync_jobs"("nextRetryAt");
CREATE INDEX "commerce_events_botId_eventType_createdAt_idx" ON "commerce_events"("botId", "eventType", "createdAt");
CREATE INDEX "commerce_events_conversationId_createdAt_idx" ON "commerce_events"("conversationId", "createdAt");
CREATE INDEX "commerce_events_productId_createdAt_idx" ON "commerce_events"("productId", "createdAt");
CREATE INDEX "commerce_events_sessionId_createdAt_idx" ON "commerce_events"("sessionId", "createdAt");

ALTER TABLE "product_sources" ADD CONSTRAINT "product_sources_botId_fkey"
FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_botId_fkey"
FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "product_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_sync_jobs" ADD CONSTRAINT "product_sync_jobs_botId_fkey"
FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_sync_jobs" ADD CONSTRAINT "product_sync_jobs_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "product_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commerce_events" ADD CONSTRAINT "commerce_events_botId_fkey"
FOREIGN KEY ("botId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commerce_events" ADD CONSTRAINT "commerce_events_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commerce_events" ADD CONSTRAINT "commerce_events_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
