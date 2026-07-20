/**
 * Simple In-Memory Vector Store
 * Alternative to FAISS - stores vectors in memory with cosine similarity search
 */

import 'server-only'
import fs from 'fs'
import path from 'path'
import type { ChunkMetadata } from './chunking'

const VECTOR_STORE_DIR = './data/vector_store'

export interface VectorDocument {
  id: string
  text: string
  embedding: number[]
  metadata: ChunkMetadata
}

interface BotVectorStore {
  documents: VectorDocument[]
  lastUpdated: string
}

// In-memory cache
const vectorCache = new Map<string, BotVectorStore>()

/**
 * Ensure vector store directory exists
 */
function ensureStoreDir(botId: string) {
  const botDir = path.join(VECTOR_STORE_DIR, botId)
  if (!fs.existsSync(botDir)) {
    fs.mkdirSync(botDir, { recursive: true })
  }
  return botDir
}

/**
 * Get file path for bot's vector store
 */
function getStorePath(botId: string) {
  return path.join(VECTOR_STORE_DIR, botId, 'vectors.json')
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
 * Load vector store for a bot
 */
export function loadVectorStore(botId: string): BotVectorStore | null {
  // Check cache first
  if (vectorCache.has(botId)) {
    return vectorCache.get(botId)!
  }
  
  const storePath = getStorePath(botId)
  
  if (!fs.existsSync(storePath)) {
    return null
  }
  
  try {
    const data = fs.readFileSync(storePath, 'utf-8')
    const store = JSON.parse(data) as BotVectorStore
    
    // Cache it
    vectorCache.set(botId, store)
    
    console.log(`📂 Loaded vector store for bot ${botId} (${store.documents.length} documents)`)
    return store
  } catch (error) {
    console.error(`Error loading vector store for bot ${botId}:`, error)
    return null
  }
}

/**
 * Save vector store for a bot
 */
export function saveVectorStore(botId: string, documents: VectorDocument[]): void {
  const store: BotVectorStore = {
    documents,
    lastUpdated: new Date().toISOString(),
  }
  
  const storePath = path.join(ensureStoreDir(botId), 'vectors.json')
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2))
  
  // Update cache
  vectorCache.set(botId, store)
  
  console.log(`💾 Saved vector store for bot ${botId} (${documents.length} documents)`)
}

/**
 * Add vectors to store
 */
export function addVectors(
  botId: string,
  newDocuments: VectorDocument[]
): void {
  const existingStore = loadVectorStore(botId)
  const allDocuments = existingStore 
    ? [...existingStore.documents, ...newDocuments]
    : newDocuments
  
  saveVectorStore(botId, allDocuments)
  
  console.log(`✅ Added ${newDocuments.length} vectors to bot ${botId}`)
}

/**
 * Search for similar vectors
 */
export function searchVectors(
  botId: string,
  queryEmbedding: number[],
  topK: number = 5
): Array<{ document: VectorDocument; score: number }> {
  const store = loadVectorStore(botId)
  
  if (!store || store.documents.length === 0) {
    return []
  }
  
  // Calculate similarity for all documents
  const results = store.documents.map((doc) => ({
    document: doc,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }))
  
  // Sort by score and return top K
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

/**
 * Delete vector store for a bot
 */
export function deleteVectorStore(botId: string): void {
  const storePath = getStorePath(botId)
  
  if (fs.existsSync(storePath)) {
    fs.unlinkSync(storePath)
    console.log(`🗑️ Deleted vector store for bot ${botId}`)
  }
  
  // Remove from cache
  vectorCache.delete(botId)
}

/**
 * Delete specific source from store
 */
export function deleteSource(botId: string, sourceId: string): void {
  const store = loadVectorStore(botId)
  
  if (!store) {
    return
  }
  
  const filteredDocuments = store.documents.filter(
    (doc) => doc.metadata.sourceId !== sourceId
  )
  
  if (filteredDocuments.length === store.documents.length) {
    console.log(`No documents found for source ${sourceId}`)
    return
  }
  
  saveVectorStore(botId, filteredDocuments)
  
  console.log(`🗑️ Deleted source ${sourceId} from bot ${botId}`)
}

/**
 * Get store statistics
 */
export function getStoreStats(botId: string) {
  const store = loadVectorStore(botId)
  
  if (!store) {
    return {
      exists: false,
      documentCount: 0,
      sources: [],
    }
  }
  
  const sourceIds = new Set(store.documents.map((doc) => doc.metadata.sourceId))
  
  return {
    exists: true,
    documentCount: store.documents.length,
    sources: Array.from(sourceIds),
    sourceCount: sourceIds.size,
  }
}
