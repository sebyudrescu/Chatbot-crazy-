import 'server-only'
import { eventStore, EventCategory, EventSeverity } from './event-store'

export async function recordPipelineStage(input: {
  botId?: string
  conversationId?: string
  jobId?: string
  stage: 'crawl' | 'cleaning' | 'embedding' | 'retrieval' | 'reranking' | 'generation' | 'web_search'
  durationMs: number
  success?: boolean
  provider?: string
  model?: string
  inputCount?: number
  outputCount?: number
  estimatedCostUsd?: number
  metadata?: Record<string, unknown>
}) {
  return eventStore.log({ botId: input.botId, conversationId: input.conversationId, jobId: input.jobId }, {
    eventType: 'pipeline.stage.completed',
    category: input.stage === 'crawl' || input.stage === 'cleaning' || input.stage === 'embedding'
      ? EventCategory.INGESTION
      : input.stage === 'generation' ? EventCategory.GENERATION : EventCategory.RETRIEVAL,
    severity: input.success === false ? EventSeverity.WARNING : EventSeverity.INFO,
    success: input.success ?? true,
    durable: true,
    durationMs: input.durationMs,
    metadata: {
      stage: input.stage,
      provider: input.provider,
      model: input.model,
      inputCount: input.inputCount,
      outputCount: input.outputCount,
      estimatedCostUsd: input.estimatedCostUsd,
      ...input.metadata,
    },
  })
}
