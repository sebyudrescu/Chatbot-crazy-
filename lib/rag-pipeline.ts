/**
 * RAG Pipeline Orchestrator
 * Main orchestration for Retrieval-Augmented Generation
 * 
 * @module rag-pipeline
 * @server-only
 */

import 'server-only'
import { generateEmbedding } from './embeddings'
import { chunkTextAuto } from './smart-chunking'
import type { TextChunk } from './chunking'
import { prisma } from './db'
import { SourceStatus } from './types'

// Pinecone is preferred at scale; PostgreSQL is the durable zero-setup fallback.
import {
  isPineconeConfigured,
  upsertVectors as pineconeUpsert,
  queryVectors as pineconeQuery,
  deleteVectorsForBot as pineconeDelete,
  getIndexStats as pineconeStats,
  type VectorChunk
} from './pinecone-vector-store'

// Fallback to simple vector store
import {
  deleteDatabaseVectorsForBot,
  getDatabaseVectorStats,
  replaceDatabaseVectors,
  searchDatabaseVectors,
} from './database-vector-store'

interface VectorDocument {
  id: string
  text: string
  embedding: number[]
  metadata: Record<string, any>
}

const shouldUsePineconeVectorStore = () => isPineconeConfigured()

/**
 * Process a document and add to knowledge base
 */
export async function processAndStoreDocument(
  botId: string,
  sourceId: string,
  sourceType: string,
  text: string
): Promise<{ success: boolean; chunkCount: number; error?: string }> {
  try {
    console.log(`🔄 Processing document ${sourceId} for bot ${botId}`)
    
    // 0. Validate input
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text: text is null, undefined, or not a string')
    }
    
    if (text.trim().length === 0) {
      throw new Error('Empty text content')
    }
    
    console.log(`📝 Text length: ${text.length} characters`)
    
    // 1. Chunk the text
    console.log(`📄 Chunking text...`)
    const rawChunks = chunkTextAuto(text, sourceId, sourceType)
    
    if (!rawChunks || !Array.isArray(rawChunks)) {
      throw new Error('chunkTextAuto returned invalid result (not an array)')
    }
    
    console.log(`📄 Created ${rawChunks.length} raw chunks`)
    
    if (rawChunks.length === 0) {
      throw new Error('No chunks created from text (text may be too short or invalid)')
    }
    
    // Validate chunks with robust checking
    const { validateChunks } = await import('./content-validation')
    const validation = validateChunks(rawChunks, {
      sourceId,
      url: sourceType // Using sourceType as placeholder for URL
    })
    
    console.log(`📊 Chunk validation: ${validation.validChunks.length} valid, ${validation.invalidCount} invalid`)
    
    if (validation.validChunks.length === 0) {
      throw new Error(`All ${rawChunks.length} chunks failed validation`)
    }
    
    // Use only valid chunks
    const chunks: TextChunk[] = validation.validChunks.map((vc, idx) => {
      const originalMetadata = rawChunks[vc.index]?.metadata

      return {
        text: vc.text,
        metadata: {
          sourceId,
          sourceType,
          chunkIndex: idx,
          startChar: originalMetadata?.startChar ?? 0,
          endChar: originalMetadata?.endChar ?? vc.text.length,
          pageNumber: originalMetadata?.pageNumber,
          title: originalMetadata?.title,
        },
      }
    })
    
    // 2. Generate embeddings for each chunk
    const documents: VectorDocument[] = []
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      console.log(`🔢 Generating embedding ${i + 1}/${chunks.length}`)
      
      const embedding = await generateEmbedding(chunk.text, { botId, feature: 'embedding_ingestion' })
      documents.push({
        id: `${sourceId}_chunk_${i}`,
        text: chunk.text,
        embedding: embedding,
        metadata: chunk.metadata,
      })
      
      // Rate limiting: wait 100ms between calls to avoid OpenAI rate limits
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    
    // 3. PostgreSQL is always the durable source of truth. Pinecone is an
    // optional high-scale search replica.
    const usePinecone = shouldUsePineconeVectorStore()
    console.log(`💾 Storing ${documents.length} vectors in PostgreSQL for bot ${botId}`)
    await replaceDatabaseVectors(botId, sourceId, documents)
    console.log(`✅ Vectors stored in PostgreSQL`)

    if (usePinecone) {
      console.log(`💾 Storing ${documents.length} vectors in Pinecone for bot ${botId}`)
      
      // Convert to Pinecone format
      const vectorChunks: VectorChunk[] = documents.map(doc => ({
        id: doc.id,
        embedding: doc.embedding,
        text: doc.text,
        metadata: {
          ...doc.metadata,
          sourceType: sourceType as 'url' | 'pdf' | 'docx' | 'txt' | 'csv' | 'manual',
          botId,
          sourceId
        }
      }))
      
      await pineconeUpsert(botId, vectorChunks)
      console.log(`✅ Vectors stored in Pinecone`)
    }
    
    // 4. Update both the source and the agent-level KB state. Direct PDF,
    // DOCX and manual imports do not pass through completeJob(), so this
    // central update keeps readiness accurate for every ingestion path.
    await prisma.$transaction(async (tx) => {
      await tx.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          status: SourceStatus.COMPLETED,
          processedAt: new Date(),
          chunkCount: chunks.length,
          errorMessage: null,
        },
      })
      const [knowledge, pendingJobs] = await Promise.all([
        tx.knowledgeSource.aggregate({
          where: { botId, status: SourceStatus.COMPLETED },
          _sum: { chunkCount: true },
        }),
        tx.ingestionJob.count({
          where: { botId, status: { in: ['pending', 'running'] } },
        }),
      ])
      await tx.chatbot.update({
        where: { id: botId },
        data: {
          kbStatus: pendingJobs > 0 ? 'indexing' : 'ready',
          kbLastIndexed: new Date(),
          kbTotalChunks: knowledge._sum.chunkCount || 0,
          kbIndexingError: null,
        },
      })
    })
    
    console.log(`✅ Successfully processed document ${sourceId}`)
    
    return {
      success: true,
      chunkCount: chunks.length,
    }
  } catch (error) {
    console.error(`❌ Error processing document ${sourceId}:`, error)
    
    // Update source and preserve any already usable knowledge for the agent.
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await prisma.$transaction(async (tx) => {
      await tx.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: SourceStatus.FAILED, errorMessage },
      })
      const knowledge = await tx.knowledgeSource.aggregate({
        where: { botId, status: SourceStatus.COMPLETED },
        _sum: { chunkCount: true },
      })
      const availableChunks = knowledge._sum.chunkCount || 0
      await tx.chatbot.update({
        where: { id: botId },
        data: {
          kbStatus: availableChunks > 0 ? 'ready' : 'failed',
          kbTotalChunks: availableChunks,
          kbIndexingError: errorMessage,
        },
      })
    })
    
    return {
      success: false,
      chunkCount: 0,
      error: errorMessage,
    }
  }
}

/**
 * Query the knowledge base and retrieve relevant chunks
 */
export async function queryKnowledgeBase(
  botId: string,
  question: string,
  options: {
    topK?: number
    minScore?: number
  } = {}
): Promise<
  Array<{
    text: string
    score: number
    metadata: any
  }>
> {
  const { topK = 5, minScore = 0.3 } = options // Lower default threshold
  
  try {
    console.log(`🔍 Querying knowledge base for bot ${botId}`)
    
    // 1. Generate embedding for question
    console.log(`🔢 Generating embedding for question`)
    const questionEmbedding = await generateEmbedding(question, { botId, feature: 'embedding_search' })
    
    // 2. Query vector store (Pinecone if configured, otherwise file-based)
    const usePinecone = shouldUsePineconeVectorStore()
    
    let results: Array<{ text: string; score: number; metadata: any }>
    
    if (usePinecone) {
      console.log(`🔍 Searching Pinecone (top ${topK})`)
      try {
        const pineconeResults = await pineconeQuery(botId, questionEmbedding, {
          topK,
          minScore
        })
        results = pineconeResults.map(r => ({
          text: r.text,
          score: r.score,
          metadata: r.metadata
        }))
      } catch (error) {
        console.error('Pinecone unavailable, using PostgreSQL fallback:', error)
        results = await searchDatabaseVectors(botId, questionEmbedding, topK, minScore)
      }

    } else {
      console.log(`🔍 Searching PostgreSQL vector fallback (top ${topK})`)
      results = await searchDatabaseVectors(
        botId,
        questionEmbedding,
        topK,
        process.env.CI_MOCK_AI === 'true' ? -1 : minScore,
      )
    }
    
    console.log(`✅ Found ${results.length} relevant chunks`)
    
    return results
    
  } catch (error) {
    console.error(`❌ Error querying knowledge base:`, error)
    throw error
  }
}

/**
 * Generate RAG response using retrieved context
 */
export async function generateRAGResponse(
  botId: string,
  question: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<{
  answer: string
  sources: Array<{ sourceId: string; sourceType: string; score: number }>
  relevantChunks: number
}> {
  // 1. Query knowledge base
  const relevantChunks = await queryKnowledgeBase(botId, question, {
    topK: 5,
    minScore: 0.7,
  })
  
  // 2. Check if we have relevant information
  if (relevantChunks.length === 0) {
    return {
      answer:
        "Mi dispiace, non ho trovato informazioni sufficienti nella knowledge base per rispondere a questa domanda. Per favore, riprova con una domanda diversa o contatta il supporto.",
      sources: [],
      relevantChunks: 0,
    }
  }
  
  // 3. Build context from chunks
  const context = relevantChunks
    .map((chunk, i) => `[Fonte ${i + 1}]\n${chunk.text}`)
    .join('\n\n')
  
  // 4. Extract unique sources
  const sourcesMap = new Map<
    string,
    { sourceId: string; sourceType: string; score: number }
  >()
  
  for (const chunk of relevantChunks) {
    const sourceId = chunk.metadata.sourceId
    if (!sourcesMap.has(sourceId) || sourcesMap.get(sourceId)!.score < chunk.score) {
      sourcesMap.set(sourceId, {
        sourceId,
        sourceType: chunk.metadata.sourceType,
        score: chunk.score,
      })
    }
  }
  
  const sources = Array.from(sourcesMap.values())
  
  // 5. Build prompt for LLM
  const systemPrompt = `Sei un assistente AI utile e preciso. 
Rispondi alle domande degli utenti SOLO utilizzando le informazioni fornite nel contesto qui sotto.
Non inventare informazioni o utilizzare conoscenze esterne.
Se la risposta non è presente nel contesto, rispondi educatamente che non hai informazioni sufficienti.
Sii conciso ma completo nelle tue risposte.

CONTESTO:
${context}

ISTRUZIONI:
- Rispondi SOLO basandoti sul contesto fornito
- Se non trovi la risposta nel contesto, dillo chiaramente
- Cita le fonti quando possibile (es. "Secondo la Fonte 1...")
- Usa un linguaggio chiaro e professionale`
  
  // 6. Call OpenAI (this will be done in the chat API route)
  // Return structured data for the chat API to use
  return {
    answer: '', // Will be filled by chat API
    sources,
    relevantChunks: relevantChunks.length,
  }
}

/**
 * Delete knowledge base for a bot
 */
export async function deleteKnowledgeBase(botId: string): Promise<void> {
  const usePinecone = shouldUsePineconeVectorStore()
  await deleteDatabaseVectorsForBot(botId)
  if (usePinecone) {
    console.log(`🗑️ Deleting vectors from Pinecone for bot ${botId}`)
    await pineconeDelete(botId)
  }
  
  await prisma.knowledgeSource.deleteMany({
    where: { botId },
  })
  
  console.log(`✅ Deleted knowledge base for bot ${botId}`)
}

/**
 * Get knowledge base statistics
 */
export async function getKnowledgeBaseStats(botId: string) {
  const usePinecone = shouldUsePineconeVectorStore()
  
  let indexStats: any
  
  if (usePinecone) {
    const stats = await pineconeStats()
    indexStats = {
      totalVectors: stats.totalVectors,
      vectorDimension: stats.dimension,
      storageType: 'pinecone'
    }
  } else {
    indexStats = {
      ...await getDatabaseVectorStats(botId),
      storageType: 'postgresql'
    }
  }
  
  const dbStats = await prisma.knowledgeSource.groupBy({
    by: ['status'],
    where: { botId },
    _count: true,
  })
  
  return {
    ...indexStats,
    databaseStats: dbStats,
  }
}
