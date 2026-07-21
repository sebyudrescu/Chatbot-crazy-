import 'server-only'
import { prisma } from './db'

type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number } | null
}

const pricingPerMillion: Array<{ test: RegExp; input: number; cached?: number; output: number }> = [
  { test: /^text-embedding-3-small/i, input: 0.02, output: 0 },
  { test: /^text-embedding-3-large/i, input: 0.13, output: 0 },
  { test: /^gpt-4o-mini-transcribe/i, input: 1.25, output: 5 },
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
  const regularInput = Math.max(0, inputTokens - cachedInputTokens)
  return Number(((regularInput * price.input + cachedInputTokens * (price.cached ?? price.input) + outputTokens * price.output) / 1_000_000).toFixed(8))
}

export async function recordAIUsage(input: {
  botId?: string | null
  conversationId?: string | null
  feature: string
  model: string
  usage?: Usage | null
  durationMs?: number
  success?: boolean
  errorCode?: string
}) {
  const inputTokens = input.usage?.prompt_tokens || 0
  const outputTokens = input.usage?.completion_tokens || 0
  const cachedInputTokens = input.usage?.prompt_tokens_details?.cached_tokens || 0
  try {
    return await prisma.aIUsageEvent.create({
      data: {
        botId: input.botId || null,
        conversationId: input.conversationId || null,
        feature: input.feature,
        model: input.model,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        totalTokens: input.usage?.total_tokens || inputTokens + outputTokens,
        estimatedCostUsd: estimateAIUsageCost(input.model, inputTokens, outputTokens, cachedInputTokens),
        durationMs: input.durationMs,
        success: input.success ?? true,
        errorCode: input.errorCode,
      },
    })
  } catch (error) {
    console.error('[AI Usage] Unable to persist usage event:', error)
    return null
  }
}
