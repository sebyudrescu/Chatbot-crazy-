/**
 * Embeddings and Vector Storage Management
 * Uses OpenAI embeddings and in-memory vector storage
 */

import OpenAI from 'openai'
import { createHash } from 'node:crypto'
import { recordAIUsage } from './ai-usage'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const useDeterministicEmbeddings =
  process.env.NODE_ENV !== 'production' &&
  process.env.CI === 'true' &&
  process.env.CI_MOCK_AI === 'true'

function deterministicEmbedding(text: string): number[] {
  const digest = createHash('sha256').update(text).digest()
  const values = Array.from({ length: 1536 }, (_, index) =>
    (digest[index % digest.length] - 127.5) / 127.5,
  )
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1
  return values.map(value => value / norm)
}

export interface VectorDocument {
  id: string
  text: string
  embedding: number[]
  metadata: {
    sourceId: string
    sourceType: string
    chunkIndex: number
  }
}

// In-memory vector store (per production, usa Pinecone, Weaviate, o Supabase)
const vectorStore = new Map<string, VectorDocument[]>()

/**
 * Generate embeddings for a text using OpenAI
 * 
 * UPGRADED: Uses text-embedding-3-small (62% cheaper, better quality)
 * - 1536 dimensions (same as ada-002 for compatibility)
 * - Better semantic understanding
 * - Faster processing
 */
export async function generateEmbedding(text: string, tracking?: { botId?: string; conversationId?: string; feature?: string }): Promise<number[]> {
  if (useDeterministicEmbeddings) return deterministicEmbedding(text)

  try {
    const startedAt = Date.now()
    const model = 'text-embedding-3-small'
    const response = await openai.embeddings.create({
      model,  // UPGRADED from ada-002
      input: text,
      dimensions: 1536,  // Match ada-002 dimensions for compatibility
    })
    await recordAIUsage({ botId: tracking?.botId, conversationId: tracking?.conversationId, feature: tracking?.feature || 'embedding', model, usage: response.usage, durationMs: Date.now() - startedAt })
    
    return response.data[0].embedding
  } catch (error) {
    console.error('Error generating embedding:', error)
    throw new Error('Failed to generate embedding')
  }
}

/**
 * Chunk text into smaller pieces for better retrieval
 */
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = []
  let start = 0
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start = end - overlap
  }
  
  return chunks
}

/**
 * Store embeddings for a document
 */
export async function storeEmbeddings(
  botId: string,
  sourceId: string,
  sourceType: string,
  text: string
): Promise<void> {
  // Chunk the text
  const chunks = chunkText(text)
  
  // Generate embeddings for each chunk
  const documents: VectorDocument[] = []
  
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i], { botId, feature: 'embedding_ingestion' })
    
    documents.push({
      id: `${sourceId}_chunk_${i}`,
      text: chunks[i],
      embedding,
      metadata: {
        sourceId,
        sourceType,
        chunkIndex: i,
      },
    })
  }
  
  // Store in vector store (keyed by botId)
  const existing = vectorStore.get(botId) || []
  vectorStore.set(botId, [...existing, ...documents])
  
  console.log(`✅ Stored ${documents.length} embeddings for source ${sourceId}`)
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Search for relevant documents using semantic similarity
 */
export async function searchSimilarDocuments(
  botId: string,
  query: string,
  topK: number = 5
): Promise<Array<{ text: string; score: number; metadata: any }>> {
  // Get embeddings for the query
  const queryEmbedding = await generateEmbedding(query, { botId, feature: 'embedding_search' })
  
  // Get all documents for this bot
  const documents = vectorStore.get(botId) || []
  
  if (documents.length === 0) {
    return []
  }
  
  // Calculate similarity scores
  const results = documents.map((doc) => ({
    text: doc.text,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
    metadata: doc.metadata,
  }))
  
  // Sort by score and return top K
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

/**
 * Delete embeddings for a specific source
 */
export function deleteEmbeddings(botId: string, sourceId: string): void {
  const documents = vectorStore.get(botId) || []
  const filtered = documents.filter((doc) => doc.metadata.sourceId !== sourceId)
  vectorStore.set(botId, filtered)
  
  console.log(`🗑️ Deleted embeddings for source ${sourceId}`)
}

/**
 * Delete all embeddings for a bot
 */
export function deleteAllEmbeddings(botId: string): void {
  vectorStore.delete(botId)
  console.log(`🗑️ Deleted all embeddings for bot ${botId}`)
}

/**
 * Get statistics about stored embeddings
 */
export function getEmbeddingStats(botId: string) {
  const documents = vectorStore.get(botId) || []
  const sourceIds = new Set(documents.map((doc) => doc.metadata.sourceId))
  
  return {
    totalChunks: documents.length,
    totalSources: sourceIds.size,
    sources: Array.from(sourceIds),
  }
}
