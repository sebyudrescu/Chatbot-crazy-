/**
 * Advanced RAG Pipeline
 * Multi-stage retrieval: Semantic + Keyword + Fusion + Reranking
 */

import { rankBm25 } from './bm25'
import { rerankWithCrossEncoder } from './cross-encoder-reranker'

export interface RagStageMetric {
  stage: 'semantic' | 'bm25' | 'fusion' | 'contextual_rerank' | 'deduplication' | 'cross_encoder'
  durationMs: number
  inputCount: number
  outputCount: number
  provider?: string
  model?: string | null
  usageTokens?: number
  fallback?: boolean
  error?: string
}

export interface RetrievedChunk {
  id: string
  text: string
  score: number
  metadata: {
    sourceId: string
    sourceType: string
    chunkIndex: number
  }
}

export interface RerankResult extends RetrievedChunk {
  finalScore: number
  semanticScore: number
  keywordScore: number
  fusionScore: number
  crossEncoderScore?: number
}

/**
 * Reciprocal Rank Fusion (RRF)
 * Combines rankings from multiple retrieval methods
 */
export function reciprocalRankFusion(
  semanticResults: RetrievedChunk[],
  keywordResults: RetrievedChunk[],
  k: number = 60 // RRF constant
): RerankResult[] {
  const scoreMap = new Map<string, {
    chunk: RetrievedChunk
    semanticScore: number
    keywordScore: number
    semanticRank: number
    keywordRank: number
  }>()

  // Process semantic results
  semanticResults.forEach((chunk, index) => {
    scoreMap.set(chunk.id, {
      chunk,
      semanticScore: chunk.score,
      keywordScore: 0,
      semanticRank: index + 1,
      keywordRank: 0,
    })
  })

  // Process keyword results
  keywordResults.forEach((chunk, index) => {
    const existing = scoreMap.get(chunk.id)
    if (existing) {
      existing.keywordScore = chunk.score
      existing.keywordRank = index + 1
    } else {
      scoreMap.set(chunk.id, {
        chunk,
        semanticScore: 0,
        keywordScore: chunk.score,
        semanticRank: 0,
        keywordRank: index + 1,
      })
    }
  })

  // Calculate RRF scores
  const results: RerankResult[] = []
  
  for (const [id, data] of scoreMap.entries()) {
    const semanticRRF = data.semanticRank > 0 ? 1 / (k + data.semanticRank) : 0
    const keywordRRF = data.keywordRank > 0 ? 1 / (k + data.keywordRank) : 0
    
    // Fusion score: weighted combination
    const fusionScore = semanticRRF * 0.7 + keywordRRF * 0.3

    // Final score: combine fusion with original scores
    const finalScore = 
      fusionScore * 0.5 + 
      data.semanticScore * 0.3 + 
      data.keywordScore * 0.2

    results.push({
      ...data.chunk,
      finalScore,
      semanticScore: data.semanticScore,
      keywordScore: data.keywordScore,
      fusionScore,
    })
  }

  // Sort by final score
  return results.sort((a, b) => b.finalScore - a.finalScore)
}

/**
 * Deduplicate similar chunks
 * Removes chunks that are too similar to higher-ranked chunks
 */
export function deduplicateChunks(
  chunks: RerankResult[],
  similarityThreshold: number = 0.85
): RerankResult[] {
  if (chunks.length === 0) return []

  const deduplicated: RerankResult[] = [chunks[0]] // Keep the top chunk

  for (let i = 1; i < chunks.length; i++) {
    const candidate = chunks[i]
    let isDuplicate = false

    // Compare with already selected chunks
    for (const selected of deduplicated) {
      const similarity = calculateTextSimilarity(candidate.text, selected.text)
      
      if (similarity > similarityThreshold) {
        isDuplicate = true
        console.log(`🔍 Deduplication: Removed similar chunk (similarity: ${similarity.toFixed(2)})`)
        break
      }
    }

    if (!isDuplicate) {
      deduplicated.push(candidate)
    }
  }

  return deduplicated
}

/**
 * Calculate text similarity using Jaccard index on word tokens
 * Fast approximation for deduplication
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(
    text1.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  )
  const tokens2 = new Set(
    text2.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  )

  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)))
  const union = new Set([...tokens1, ...tokens2])

  return intersection.size / union.size
}

/**
 * Contextual reranking: boost chunks based on context relevance
 */
export function contextualRerank(
  chunks: RerankResult[],
  query: string,
  conversationContext?: string[]
): RerankResult[] {
  if (!conversationContext || conversationContext.length === 0) {
    return chunks
  }

  // Extract key terms from conversation context
  const contextTerms = conversationContext
    .join(' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 3)

  const contextTermSet = new Set(contextTerms)

  return chunks.map((chunk) => {
    // Count how many context terms appear in this chunk
    const chunkTokens = chunk.text.toLowerCase().split(/\s+/)
    const contextMatches = chunkTokens.filter((token) => 
      contextTermSet.has(token)
    ).length

    // Context boost: up to 10% score increase
    const contextBoost = Math.min(contextMatches / 20, 0.1)
    
    return {
      ...chunk,
      finalScore: chunk.finalScore * (1 + contextBoost),
    }
  }).sort((a, b) => b.finalScore - a.finalScore)
}

/**
 * Advanced RAG retrieval pipeline
 * Combines semantic search, keyword search, fusion, and deduplication
 */
export async function advancedRetrieve(
  query: string,
  allChunks: RetrievedChunk[],
  options: {
    topK?: number
    enableKeywordSearch?: boolean
    enableDeduplication?: boolean
    conversationContext?: string[]
    minSemanticScore?: number
    keywordCandidates?: RetrievedChunk[]
    enableCrossEncoder?: boolean
    stageMetrics?: RagStageMetric[]
  } = {}
): Promise<RerankResult[]> {
  const {
    topK = 5,
    enableKeywordSearch = true,
    enableDeduplication = true,
    conversationContext = [],
    minSemanticScore = 0.3,
    keywordCandidates = allChunks,
    enableCrossEncoder = false,
    stageMetrics,
  } = options

  console.log(`🔍 Advanced RAG retrieval for query: "${query}"`)
  console.log(`📊 Total chunks available: ${allChunks.length}`)

  // STAGE 1: Semantic search (already done by vector store)
  let stageStartedAt = Date.now()
  const semanticResults = allChunks
    .filter((chunk) => chunk.score >= minSemanticScore)
    .slice(0, 20) // Top 20 candidates
  stageMetrics?.push({ stage: 'semantic', durationMs: Date.now() - stageStartedAt, inputCount: allChunks.length, outputCount: semanticResults.length })

  console.log(`✅ Stage 1 - Semantic: ${semanticResults.length} chunks (min score: ${minSemanticScore})`)

  // STAGE 2: Keyword/BM25 search
  let keywordResults: RetrievedChunk[] = []
  
  if (enableKeywordSearch) {
    stageStartedAt = Date.now()
    keywordResults = rankBm25(query, keywordCandidates, { topK: 20 })
      .map(({ document, score }) => ({ ...document, score }))
    stageMetrics?.push({ stage: 'bm25', durationMs: Date.now() - stageStartedAt, inputCount: keywordCandidates.length, outputCount: keywordResults.length, provider: 'local' })

    console.log(`✅ Stage 2 - Keyword: ${keywordResults.length} chunks`)
  }

  // STAGE 3: Reciprocal Rank Fusion
  stageStartedAt = Date.now()
  let fusedResults = reciprocalRankFusion(semanticResults, keywordResults)
  stageMetrics?.push({ stage: 'fusion', durationMs: Date.now() - stageStartedAt, inputCount: semanticResults.length + keywordResults.length, outputCount: fusedResults.length })
  
  console.log(`✅ Stage 3 - Fusion: ${fusedResults.length} chunks combined`)

  // STAGE 4: Contextual reranking
  if (conversationContext.length > 0) {
    stageStartedAt = Date.now()
    fusedResults = contextualRerank(fusedResults, query, conversationContext)
    stageMetrics?.push({ stage: 'contextual_rerank', durationMs: Date.now() - stageStartedAt, inputCount: fusedResults.length, outputCount: fusedResults.length, provider: 'local' })
    console.log(`✅ Stage 4 - Contextual rerank: applied conversation context`)
  }

  // STAGE 5: Deduplication
  if (enableDeduplication) {
    stageStartedAt = Date.now()
    const beforeDedup = fusedResults.length
    fusedResults = deduplicateChunks(fusedResults, 0.85)
    stageMetrics?.push({ stage: 'deduplication', durationMs: Date.now() - stageStartedAt, inputCount: beforeDedup, outputCount: fusedResults.length, provider: 'local' })
    console.log(`✅ Stage 5 - Deduplication: ${beforeDedup} → ${fusedResults.length} chunks`)
  }

  const crossEncoderInputCount = fusedResults.length
  const crossEncoder = await rerankWithCrossEncoder(query, fusedResults, {
    enabled: enableCrossEncoder,
    topK: Math.max(topK, 10),
  })
  fusedResults = crossEncoder.documents
  stageMetrics?.push({
    stage: 'cross_encoder',
    durationMs: crossEncoder.durationMs,
    inputCount: crossEncoderInputCount,
    outputCount: fusedResults.length,
    provider: crossEncoder.provider,
    model: crossEncoder.model,
    usageTokens: crossEncoder.usageTokens,
    fallback: !crossEncoder.applied,
    error: crossEncoder.error,
  })

  // Return top K results
  const finalResults = fusedResults.slice(0, topK)
  
  console.log(`🎯 Final results: ${finalResults.length} chunks (requested: ${topK})`)
  if (finalResults.length > 0) {
    console.log(`   Top score: ${finalResults[0].finalScore.toFixed(3)} (semantic: ${finalResults[0].semanticScore.toFixed(3)}, keyword: ${finalResults[0].keywordScore.toFixed(3)})`)
  }

  return finalResults
}

/**
 * Convert simple chunks to format expected by advanced RAG
 */
export function prepareChunksForAdvancedRAG(
  chunks: Array<{ text: string; score: number; metadata: any }>
): RetrievedChunk[] {
  return chunks.map((chunk, index) => ({
    id: `${chunk.metadata.sourceId}_chunk_${chunk.metadata.chunkIndex || index}`,
    text: chunk.text,
    score: chunk.score,
    metadata: chunk.metadata,
  }))
}
