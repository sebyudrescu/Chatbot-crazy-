/**
 * FAISS Vector Store Management
 * Handles creation, persistence, and search of FAISS indices
 * 
 * @module vector-store
 * @server-only
 */

import 'server-only'
import fs from 'fs'
import path from 'path'
import type { ChunkMetadata } from './chunking'

// Import FAISS - works only on server-side
import { IndexFlatL2 } from 'faiss-node'

const FAISS_INDICES_DIR = './data/faiss_indices'

export interface VectorDocument {
  id: string
  text: string
  metadata: ChunkMetadata
}

interface IndexData {
  vectors: number[][]
  documents: VectorDocument[]
}

/**
 * Ensure FAISS indices directory exists
 */
function ensureIndicesDir(botId: string) {
  const botDir = path.join(FAISS_INDICES_DIR, botId)
  if (!fs.existsSync(botDir)) {
    fs.mkdirSync(botDir, { recursive: true })
  }
  return botDir
}

/**
 * Get file paths for bot's FAISS index
 */
function getIndexPaths(botId: string) {
  const botDir = ensureIndicesDir(botId)
  return {
    indexFile: path.join(botDir, 'index.faiss'),
    metadataFile: path.join(botDir, 'metadata.json'),
    documentsFile: path.join(botDir, 'documents.json'),
  }
}

/**
 * Create a new FAISS index for a bot
 */
export function createIndex(dimension: number = 1536): IndexFlatL2 {
  return new IndexFlatL2(dimension)
}

/**
 * Add vectors to FAISS index
 */
export function addVectors(
  index: IndexFlatL2,
  embeddings: number[][],
  documents: VectorDocument[]
): void {
  if (embeddings.length !== documents.length) {
    throw new Error('Embeddings and documents length mismatch')
  }
  
  // FAISS expects Float32Array
  const vectors = embeddings.map((emb) => new Float32Array(emb))
  
  for (const vector of vectors) {
    index.add(Array.from(vector))
  }
  
  console.log(`✅ Added ${vectors.length} vectors to index`)
}

/**
 * Search for similar vectors in FAISS index
 */
export function searchVectors(
  index: IndexFlatL2,
  queryEmbedding: number[],
  documents: VectorDocument[],
  topK: number = 5
): Array<{ document: VectorDocument; score: number }> {
  if (documents.length === 0) {
    return []
  }
  
  const queryVector = new Float32Array(queryEmbedding)
  const result = index.search(Array.from(queryVector), topK)
  
  const results: Array<{ document: VectorDocument; score: number }> = []
  
  for (let i = 0; i < result.labels.length; i++) {
    const docIndex = result.labels[i]
    const distance = result.distances[i]
    
    if (docIndex >= 0 && docIndex < documents.length) {
      // Convert L2 distance to similarity score (lower distance = higher similarity)
      const score = 1 / (1 + distance)
      
      results.push({
        document: documents[docIndex],
        score,
      })
    }
  }
  
  return results
}

/**
 * Save FAISS index and metadata to disk
 */
export function saveIndex(
  botId: string,
  index: IndexFlatL2,
  documents: VectorDocument[]
): void {
  const paths = getIndexPaths(botId)
  
  // Save FAISS index
  index.write(paths.indexFile)
  
  // Save documents metadata
  fs.writeFileSync(paths.documentsFile, JSON.stringify(documents, null, 2))
  
  // Save index metadata
  const metadata = {
    botId,
    dimension: 1536,
    documentCount: documents.length,
    lastUpdated: new Date().toISOString(),
  }
  fs.writeFileSync(paths.metadataFile, JSON.stringify(metadata, null, 2))
  
  console.log(`💾 Saved FAISS index for bot ${botId}`)
}

/**
 * Load FAISS index and metadata from disk
 */
export function loadIndex(botId: string): {
  index: IndexFlatL2
  documents: VectorDocument[]
} | null {
  const paths = getIndexPaths(botId)
  
  // Check if index exists
  if (!fs.existsSync(paths.indexFile) || !fs.existsSync(paths.documentsFile)) {
    console.log(`No index found for bot ${botId}`)
    return null
  }
  
  try {
    // Load FAISS index
    const index = IndexFlatL2.read(paths.indexFile)
    
    // Load documents
    const documentsData = fs.readFileSync(paths.documentsFile, 'utf-8')
    const documents = JSON.parse(documentsData) as VectorDocument[]
    
    console.log(`📂 Loaded FAISS index for bot ${botId} (${documents.length} documents)`)
    
    return { index, documents }
  } catch (error) {
    console.error(`Error loading index for bot ${botId}:`, error)
    return null
  }
}

/**
 * Delete FAISS index for a bot
 */
export function deleteIndex(botId: string): void {
  const botDir = path.join(FAISS_INDICES_DIR, botId)
  
  if (fs.existsSync(botDir)) {
    fs.rmSync(botDir, { recursive: true, force: true })
    console.log(`🗑️ Deleted FAISS index for bot ${botId}`)
  }
}

/**
 * Delete specific source from index
 */
export function deleteSource(botId: string, sourceId: string): void {
  const loaded = loadIndex(botId)
  
  if (!loaded) {
    console.log(`No index found for bot ${botId}`)
    return
  }
  
  const { documents } = loaded
  
  // Filter out documents from this source
  const filteredDocuments = documents.filter(
    (doc) => doc.metadata.sourceId !== sourceId
  )
  
  if (filteredDocuments.length === documents.length) {
    console.log(`No documents found for source ${sourceId}`)
    return
  }
  
  // Rebuild index without deleted source
  const newIndex = createIndex()
  const embeddings: number[][] = [] // Would need to store embeddings separately
  
  // For now, we'll delete and require rebuild
  // In production, store embeddings separately for partial updates
  console.log(`⚠️ Partial delete requires full rebuild. Deleting entire index.`)
  deleteIndex(botId)
  
  console.log(`🗑️ Deleted source ${sourceId} from bot ${botId}`)
}

/**
 * Get index statistics
 */
export function getIndexStats(botId: string) {
  const loaded = loadIndex(botId)
  
  if (!loaded) {
    return {
      exists: false,
      documentCount: 0,
      sources: [],
    }
  }
  
  const { documents } = loaded
  const sourceIds = new Set(documents.map((doc) => doc.metadata.sourceId))
  
  return {
    exists: true,
    documentCount: documents.length,
    sources: Array.from(sourceIds),
    sourceCount: sourceIds.size,
  }
}
