type ModelPricing = {
  test: RegExp
  input: number
  cached?: number
  output: number
  longContextThreshold?: number
}

const pricingPerMillion: ModelPricing[] = [
  { test: /^text-embedding-3-small/i, input: 0.02, output: 0 },
  { test: /^text-embedding-3-large/i, input: 0.13, output: 0 },
  { test: /^gpt-4o-mini-transcribe/i, input: 1.25, output: 5 },
  { test: /^gpt-5\.6-luna(?:-|$)/i, input: 0.20, cached: 0.02, output: 1.20, longContextThreshold: 272_000 },
  { test: /^gpt-5\.6-terra(?:-|$)/i, input: 2, cached: 0.20, output: 12, longContextThreshold: 272_000 },
  { test: /^(?:gpt-5\.6-sol(?:-|$)|gpt-5\.6$)/i, input: 5, cached: 0.50, output: 30, longContextThreshold: 272_000 },
  { test: /^gpt-4o-mini/i, input: 0.15, cached: 0.075, output: 0.60 },
  { test: /^gpt-4o/i, input: 2.50, cached: 1.25, output: 10 },
  { test: /^gpt-4\.1-mini/i, input: 0.40, cached: 0.10, output: 1.60 },
  { test: /^gpt-4\.1/i, input: 2, cached: 0.50, output: 8 },
  { test: /^gpt-3\.5-turbo/i, input: 0.50, output: 1.50 },
  { test: /^gpt-4(?:-|$)/i, input: 30, output: 60 },
]

export function estimateAIUsageCost(model: string, inputTokens: number, outputTokens = 0, cachedInputTokens = 0) {
  const price = pricingPerMillion.find(item => item.test.test(model))
  if (!price) return 0

  const safeInputTokens = Math.max(0, inputTokens)
  const safeCachedTokens = Math.min(safeInputTokens, Math.max(0, cachedInputTokens))
  const regularInput = safeInputTokens - safeCachedTokens
  const longContext = Boolean(price.longContextThreshold && safeInputTokens > price.longContextThreshold)
  const inputMultiplier = longContext ? 2 : 1
  const outputMultiplier = longContext ? 1.5 : 1

  const inputCost = (
    regularInput * price.input
    + safeCachedTokens * (price.cached ?? price.input)
  ) * inputMultiplier
  const outputCost = Math.max(0, outputTokens) * price.output * outputMultiplier

  return Number(((inputCost + outputCost) / 1_000_000).toFixed(8))
}
