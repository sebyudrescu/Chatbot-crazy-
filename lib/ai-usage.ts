import 'server-only'
import { prisma } from './db'
import { recordPipelineStage } from './pipeline-telemetry'
import { estimateAIUsageCost } from './ai-pricing'

export { estimateAIUsageCost } from './ai-pricing'

type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number } | null
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
    const event = await prisma.aIUsageEvent.create({
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
    await recordPipelineStage({
      botId: input.botId || undefined,
      conversationId: input.conversationId || undefined,
      stage: input.feature.includes('embedding') ? 'embedding' : 'generation',
      durationMs: input.durationMs || 0,
      success: input.success ?? true,
      provider: 'openai',
      model: input.model,
      estimatedCostUsd: event.estimatedCostUsd,
      metadata: { feature: input.feature, totalTokens: event.totalTokens },
    })
    return event
  } catch (error) {
    console.error('[AI Usage] Unable to persist usage event:', error)
    return null
  }
}
