type Bucket = { count: number; resetAt: number }

const globalBuckets = globalThis as typeof globalThis & {
  __litxRateLimitBuckets?: Map<string, Bucket>
}

const buckets = globalBuckets.__litxRateLimitBuckets || new Map<string, Bucket>()
if (process.env.NODE_ENV !== 'production') globalBuckets.__litxRateLimitBuckets = buckets

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    cleanup(now)
    return { allowed: true, remaining: limit - 1, resetAt }
  }
  current.count += 1
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  }
}

function cleanup(now: number) {
  if (buckets.size < 5000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function requestClientIp(headers: Headers) {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || 'unknown'
}
