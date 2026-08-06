import "server-only";

import type { ProductSyncJob } from "@prisma/client";
import { prisma } from "./db";
import { syncCommercePlatform } from "./commerce-platform-sync";
import { decryptConfigSecrets } from "./secret-config";
import { normalizeShopDomain } from "./shopify-signatures";
import { assertSafeRemoteUrl } from "./url-safety";

export type CommerceProvider = "shopify" | "woocommerce";

type SyncResult = { created: number; updated: number; failed: number };
type SyncRunner = (
  botId: string,
  provider: CommerceProvider,
  options: {
    jobId: string;
    jobAttempt: number;
    onProgress: (progress: number, message: string) => Promise<void>;
  },
) => Promise<SyncResult>;

const STALE_AFTER_MS = 5 * 60 * 1_000;

function parseConfig(value: string) {
  try {
    return decryptConfigSecrets(JSON.parse(value || "{}")) as Record<string, string>;
  } catch {
    throw new Error("Configurazione commerce non leggibile: ricollega il negozio");
  }
}

async function storeOrigin(
  provider: CommerceProvider,
  connection: { externalAccountId: string | null; config: string },
) {
  const config = parseConfig(connection.config);
  if (provider === "shopify") {
    const domain = normalizeShopDomain(
      connection.externalAccountId || config.shopDomain || config.shopUrl || "",
    );
    if (!domain) throw new Error("Dominio Shopify non valido: ricollega il negozio");
    return `https://${domain}`;
  }
  const store = await assertSafeRemoteUrl(connection.externalAccountId || config.storeUrl || "");
  return store.origin;
}

export function serializeCommerceSyncJob(job: ProductSyncJob) {
  return {
    id: job.id,
    botId: job.botId,
    sourceId: job.sourceId,
    status: job.status,
    progress: job.progress,
    productsSeen: job.productsSeen,
    productsCreated: job.productsCreated,
    productsUpdated: job.productsUpdated,
    productsFailed: job.productsFailed,
    error: job.errorMessage,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    nextRetryAt: job.nextRetryAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
  };
}

export async function enqueueCommerceSync(botId: string, provider: CommerceProvider) {
  const connection = await prisma.integrationConnection.findUnique({
    where: { botId_provider: { botId, provider } },
    select: { enabled: true, externalAccountId: true, config: true },
  });
  if (!connection?.enabled) throw new Error(`${provider} non è collegato o è disattivato`);
  const baseUrl = await storeOrigin(provider, connection);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${`commerce-sync:${botId}:${provider}`})::bigint)`;
    let source = await tx.productSource.findFirst({ where: { botId, sourceType: provider, baseUrl } });
    source ??= await tx.productSource.create({
      data: {
        botId,
        sourceType: provider,
        name: `${provider === "shopify" ? "Shopify" : "WooCommerce"}: ${new URL(baseUrl).hostname}`,
        baseUrl,
      },
    });
    const active = await tx.productSyncJob.findFirst({
      where: { botId, sourceId: source.id, status: { in: ["pending", "running"] } },
      orderBy: { createdAt: "desc" },
    });
    if (active) return { job: active, reused: true };
    const job = await tx.productSyncJob.create({
      data: { botId, sourceId: source.id, status: "pending", progress: 0, attempts: 0, maxAttempts: 3 },
    });
    return { job, reused: false };
  });
}

export async function recoverStaleCommerceSyncJobs(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const stale = await prisma.productSyncJob.findMany({
    where: { status: "running", startedAt: { lte: cutoff } },
    select: { id: true, attempts: true, maxAttempts: true },
  });
  for (const job of stale) {
    if (job.attempts >= job.maxAttempts) {
      await prisma.productSyncJob.updateMany({
        where: { id: job.id, status: "running", attempts: job.attempts, startedAt: { lte: cutoff } },
        data: {
          status: "failed",
          completedAt: now,
          errorMessage: "Sincronizzazione interrotta dopo il numero massimo di tentativi",
        },
      });
    } else {
      await prisma.productSyncJob.updateMany({
        where: { id: job.id, status: "running", attempts: job.attempts, startedAt: { lte: cutoff } },
        data: {
          status: "pending",
          nextRetryAt: now,
          errorMessage: "Worker interrotto: ripresa automatica in corso",
        },
      });
    }
  }
  return stale.length;
}

export async function getCommerceSyncJob(jobId: string) {
  return prisma.productSyncJob.findUnique({ where: { id: jobId } });
}

export async function getLatestCommerceSyncJob(botId: string, provider: CommerceProvider) {
  return prisma.productSyncJob.findFirst({
    where: { botId, source: { sourceType: provider } },
    orderBy: { createdAt: "desc" },
  });
}

export async function processCommerceSyncJob(
  jobId: string,
  runner: SyncRunner = syncCommercePlatform,
) {
  await recoverStaleCommerceSyncJobs();
  const pending = await prisma.productSyncJob.findUnique({
    where: { id: jobId },
    include: { source: { select: { sourceType: true } } },
  });
  if (!pending || pending.status !== "pending") return pending;
  if (pending.nextRetryAt && pending.nextRetryAt > new Date()) return pending;
  if (pending.attempts >= pending.maxAttempts) {
    return prisma.productSyncJob.update({
      where: { id: pending.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: pending.errorMessage || "Tentativi esauriti" },
    });
  }
  if (pending.source.sourceType !== "shopify" && pending.source.sourceType !== "woocommerce") {
    return prisma.productSyncJob.update({
      where: { id: pending.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: "Provider commerce non supportato" },
    });
  }

  const attempt = pending.attempts + 1;
  const claimed = await prisma.productSyncJob.updateMany({
    where: { id: pending.id, status: "pending", attempts: pending.attempts },
    data: {
      status: "running",
      attempts: attempt,
      startedAt: new Date(),
      completedAt: null,
      nextRetryAt: null,
      progress: Math.max(1, pending.progress),
    },
  });
  if (claimed.count !== 1) return getCommerceSyncJob(jobId);

  let lastProgress = Math.max(1, pending.progress);
  let leaseLost = false;
  const touchLease = async (progress?: number) => {
    if (progress !== undefined) lastProgress = Math.max(lastProgress, Math.min(99, Math.round(progress)));
    const updated = await prisma.productSyncJob.updateMany({
      where: { id: jobId, status: "running", attempts: attempt },
      data: { startedAt: new Date(), ...(progress !== undefined ? { progress: lastProgress } : {}) },
    });
    if (updated.count !== 1) {
      leaseLost = true;
      throw new Error("Lease del job commerce persa");
    }
  };
  const heartbeat = setInterval(() => {
    void touchLease().catch(() => { leaseLost = true; });
  }, 15_000);

  try {
    const result = await runner(pending.botId, pending.source.sourceType, {
      jobId,
      jobAttempt: attempt,
      onProgress: async (progress) => touchLease(progress),
    });
    if (leaseLost) return getCommerceSyncJob(jobId);
    const completed = await prisma.productSyncJob.updateMany({
      where: { id: jobId, status: "running", attempts: attempt },
      data: {
        status: "completed",
        progress: 100,
        productsCreated: result.created,
        productsUpdated: result.updated,
        productsFailed: result.failed,
        completedAt: new Date(),
        nextRetryAt: null,
        errorMessage: result.failed ? `${result.failed} prodotti non importati` : null,
      },
    });
    if (completed.count !== 1) return getCommerceSyncJob(jobId);
  } catch (error) {
    if (leaseLost) return getCommerceSyncJob(jobId);
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Sincronizzazione fallita";
    const exhausted = attempt >= pending.maxAttempts;
    await prisma.productSyncJob.updateMany({
      where: { id: jobId, status: "running", attempts: attempt },
      data: exhausted
        ? { status: "failed", completedAt: new Date(), errorMessage: message }
        : {
            status: "pending",
            nextRetryAt: new Date(Date.now() + (10_000 * (2 ** (attempt - 1)))),
            errorMessage: message,
          },
    });
    if (exhausted) {
      await prisma.productSource.update({
        where: { id: pending.sourceId },
        data: { status: "error", lastError: message },
      });
    }
  } finally {
    clearInterval(heartbeat);
  }
  return getCommerceSyncJob(jobId);
}

export async function drainCommerceSyncJob(jobId: string) {
  let job = await processCommerceSyncJob(jobId);
  while (job?.status === "pending" && job.nextRetryAt && job.attempts < job.maxAttempts) {
    const delay = Math.max(0, job.nextRetryAt.getTime() - Date.now());
    if (delay > 30_000) return job;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    job = await processCommerceSyncJob(jobId);
  }
  return job;
}
