import { prisma } from "./db";

type Bucket = { count: number; resetAt: number };
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

const globalBuckets = globalThis as typeof globalThis & {
  __litxRateLimitBuckets?: Map<string, Bucket>;
};

const buckets = globalBuckets.__litxRateLimitBuckets || new Map<string, Bucket>();
if (process.env.NODE_ENV !== "production") {
  globalBuckets.__litxRateLimitBuckets = buckets;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (process.env.NODE_ENV === "production") {
    return checkPersistentRateLimit(key, limit, windowMs);
  }
  return checkMemoryRateLimit(key, limit, windowMs);
}

export async function checkPersistentRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const nextReset = new Date(now.getTime() + windowMs);
  await prisma.rateLimitBucket.createMany({
    data: [{ key, count: 0, resetAt: nextReset }],
    skipDuplicates: true,
  });
  const [, bucket] = await prisma.$transaction([
    prisma.rateLimitBucket.updateMany({
      where: { key, resetAt: { lte: now } },
      data: { count: 0, resetAt: nextReset },
    }),
    prisma.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
    }),
  ]);

  if (Math.random() < 0.01) {
    void prisma.rateLimitBucket.deleteMany({
      where: { resetAt: { lt: now } },
    }).catch(() => undefined);
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt.getTime(),
  };
}

function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    cleanup(now);
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

function cleanup(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function requestClientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")
    || "unknown";
}
