import 'server-only'
import { prisma } from './db'
import { queryKnowledgeBase } from './rag-pipeline'
import { listDatabaseTextChunks } from './database-vector-store'
import { advancedRetrieve, prepareChunksForAdvancedRAG } from './advanced-rag'
import type { ChatbotSettings } from './types'

function parseSettings(value: string | null): ChatbotSettings {
  try { return JSON.parse(value || '{}') as ChatbotSettings } catch { return {} }
}

export async function retrieveBenchmarkCandidates(params: {
  botId: string
  query: string
  topK?: number
}) {
  const chatbot = await prisma.chatbot.findUnique({ where: { id: params.botId }, select: { settings: true } })
  if (!chatbot) throw new Error('Chatbot non trovato')
  const settings = parseSettings(chatbot.settings)
  const retrievalMinScore = settings.ragCalibration?.retrievalMinScore ?? settings.retrievalMinScore ?? 0.3
  const [semantic, corpus] = await Promise.all([
    queryKnowledgeBase(params.botId, params.query, {
      topK: 100,
      minScore: Math.max(0, retrievalMinScore - 0.1),
    }),
    listDatabaseTextChunks(params.botId),
  ])
  return advancedRetrieve(params.query, prepareChunksForAdvancedRAG(semantic), {
    topK: Math.max(1, Math.min(params.topK ?? 20, 50)),
    minSemanticScore: retrievalMinScore,
    keywordCandidates: prepareChunksForAdvancedRAG(corpus),
    enableKeywordSearch: true,
    enableDeduplication: true,
    enableCrossEncoder: settings.rerankerEnabled,
  })
}
