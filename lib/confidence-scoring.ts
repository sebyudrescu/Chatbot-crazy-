/**
 * Confidence Scoring System
 * Calculates confidence scores to prevent hallucinations
 */

export interface ConfidenceResult {
  overallConfidence: number // 0.0 - 1.0
  shouldRespond: boolean
  reason: string
  metrics: {
    topChunkScore: number
    avgTopChunksScore: number
    numHighQualityChunks: number
    totalChunks: number
  }
}

export interface ChunkWithScore {
  text: string
  score: number
  metadata: any
}

/**
 * Calculate confidence score based on RAG retrieval results
 * 
 * Algorithm:
 * 1. Top chunk score (most relevant chunk)
 * 2. Average of top 3 chunks
 * 3. Number of chunks above quality threshold (>0.7)
 * 4. Overall confidence = weighted combination
 */
export function calculateConfidence(
  chunks: ChunkWithScore[],
  options: {
    minTopScore?: number      // Default: 0.75
    minAvgScore?: number      // Default: 0.65
    minHighQualityChunks?: number // Default: 1
  } = {}
): ConfidenceResult {
  const {
    minTopScore = 0.75,
    minAvgScore = 0.65,
    minHighQualityChunks = 1,
  } = options

  // No chunks = no confidence
  if (chunks.length === 0) {
    return {
      overallConfidence: 0,
      shouldRespond: false,
      reason: 'NO_CHUNKS_FOUND',
      metrics: {
        topChunkScore: 0,
        avgTopChunksScore: 0,
        numHighQualityChunks: 0,
        totalChunks: 0,
      },
    }
  }

  // Sort by score descending
  const sortedChunks = [...chunks].sort((a, b) => b.score - a.score)

  // 1. Top chunk score (most important signal)
  const topChunkScore = sortedChunks[0].score

  // 2. Average of top 3 chunks (or all if less than 3)
  const topN = Math.min(3, sortedChunks.length)
  const topChunks = sortedChunks.slice(0, topN)
  const avgTopChunksScore =
    topChunks.reduce((sum, chunk) => sum + chunk.score, 0) / topN

  // 3. Number of high quality chunks (score > 0.65, lowered from 0.7 to match new threshold)
  const numHighQualityChunks = sortedChunks.filter(
    (chunk) => chunk.score >= 0.65
  ).length

  // 4. Calculate overall confidence (weighted)
  // - Top chunk: 50% weight
  // - Avg top 3: 30% weight  
  // - High quality count (normalized): 20% weight
  const highQualityRatio = Math.min(numHighQualityChunks / 3, 1.0)
  const overallConfidence =
    topChunkScore * 0.5 + avgTopChunksScore * 0.3 + highQualityRatio * 0.2

  // 5. Determine if we should respond
  let shouldRespond = true
  let reason = 'CONFIDENT'

  if (topChunkScore < minTopScore) {
    shouldRespond = false
    reason = 'TOP_CHUNK_SCORE_TOO_LOW'
  } else if (avgTopChunksScore < minAvgScore) {
    shouldRespond = false
    reason = 'AVERAGE_SCORE_TOO_LOW'
  } else if (numHighQualityChunks < minHighQualityChunks) {
    shouldRespond = false
    reason = 'NOT_ENOUGH_HIGH_QUALITY_CHUNKS'
  }

  return {
    overallConfidence,
    shouldRespond,
    reason,
    metrics: {
      topChunkScore,
      avgTopChunksScore,
      numHighQualityChunks,
      totalChunks: chunks.length,
    },
  }
}

/**
 * Generate a fallback message when confidence is too low
 */
export function generateFallbackMessage(
  reason: string,
  companyName?: string
): string {
  const company = companyName || 'la nostra azienda'

  const fallbackMessages: Record<string, string> = {
    NO_CHUNKS_FOUND: `Mi dispiace, non ho trovato informazioni nella mia knowledge base per rispondere a questa domanda. 

Puoi provare a:
• Riformulare la domanda in modo diverso
• Contattare il nostro supporto per assistenza diretta`,

    TOP_CHUNK_SCORE_TOO_LOW: `Non sono sicuro di avere informazioni sufficientemente precise per rispondere a questa domanda.

Per evitare di darti informazioni errate, ti consiglio di:
• Contattare il nostro supporto per una risposta accurata
• Verificare nella documentazione ufficiale`,

    AVERAGE_SCORE_TOO_LOW: `Ho trovato alcune informazioni correlate, ma non sono abbastanza sicuro che rispondano esattamente alla tua domanda.

Per avere una risposta precisa, ti suggerisco di:
• Riformulare la domanda con più dettagli
• Contattare il nostro team di supporto`,

    NOT_ENOUGH_HIGH_QUALITY_CHUNKS: `Le informazioni che ho trovato potrebbero non essere complete o abbastanza specifiche per la tua domanda.

Ti consiglio di:
• Provare con una domanda più specifica
• Contattare il nostro supporto per assistenza personalizzata`,
  }

  return (
    fallbackMessages[reason] ||
    `Mi dispiace, non ho informazioni sufficientemente affidabili per rispondere a questa domanda. Ti consiglio di contattare il nostro supporto per assistenza diretta.`
  )
}

/**
 * Format sources with citations
 */
export function formatSourceCitations(
  chunks: ChunkWithScore[]
): { citationText: string; sources: Array<{ id: string; score: number }> } {
  if (chunks.length === 0) {
    return { citationText: '', sources: [] }
  }

  // Get unique sources sorted by score
  const sourceMap = new Map<string, { score: number; type: string }>()
  
  for (const chunk of chunks) {
    const sourceId = chunk.metadata.sourceId
    const existing = sourceMap.get(sourceId)
    
    if (!existing || existing.score < chunk.score) {
      sourceMap.set(sourceId, {
        score: chunk.score,
        type: chunk.metadata.sourceType,
      })
    }
  }

  const sources = Array.from(sourceMap.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .map(([id, data]) => ({ id, score: data.score }))

  // Format citation text
  const citationText =
    sources.length > 0
      ? `\n\n📚 *Fonti utilizzate*: ${sources.length} documento${sources.length > 1 ? 'i' : ''} (confidenza: ${Math.round(sources[0].score * 100)}%)`
      : ''

  return { citationText, sources }
}
