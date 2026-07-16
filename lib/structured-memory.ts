/**
 * COGNITIVE MEMORY SYSTEM - Structured Memory Management
 * 
 * Gestisce il sistema di memoria multi-livello:
 * 1. Context Memory (Short-term): Stato conversazione corrente
 * 2. Persistent Memory (Long-term): Fatti strutturati con normalizzazione entità
 * 3. Semantic Knowledge Base: RAG tradizionale (separato!)
 * 4. Temporal Index: Gestione temporale e supersedenza
 * 
 * @module structured-memory
 */

import 'server-only'
import { prisma } from './db'
import { generateEmbedding } from './embeddings'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type FactType = 'preference' | 'profile' | 'decision' | 'complaint' | 'request' | 'feedback'
export type FactCategory = 'product' | 'service' | 'technical' | 'billing' | 'general' | 'support'
export type EntityType = 'person' | 'product' | 'company' | 'feature' | 'issue' | 'topic'
export type FactSource = 'user_stated' | 'inferred' | 'extracted'

export interface StructuredFact {
  id: string
  conversationId: string
  botId: string
  
  // Classification
  factType: FactType
  category: FactCategory
  
  // Entity Normalization
  entityType?: EntityType
  entityName?: string
  attribute?: string
  value: string
  
  // Confidence & Validity
  confidence: number
  source: FactSource
  
  // Temporal
  extractedAt: Date
  validFrom: Date
  validUntil?: Date
  isActive: boolean
  
  // Conflict Resolution
  supersedes?: string[]
  supersededBy?: string
  
  // Semantic Search
  embedding?: number[]
  embeddingModel?: string
  
  // Multi-dimensional Indexing
  intent?: string
  sentiment?: string
  importance: number
  
  // Metadata
  rawText?: string
  extractionMethod?: string
  metadata?: Record<string, any>
}

export interface MemoryQuery {
  // Required
  conversationId: string
  botId: string
  query: string
  
  // Optional filters
  factTypes?: FactType[]
  categories?: FactCategory[]
  entityTypes?: EntityType[]
  entityNames?: string[]
  minConfidence?: number
  minImportance?: number
  
  // Temporal filters
  validAt?: Date
  includeInactive?: boolean
  
  // Retrieval options
  topK?: number
  useSemanticSearch?: boolean
  useCategoryFilter?: boolean
}

export interface MemoryContext {
  // Short-term context (last few messages)
  recentMessages: Array<{ role: string; content: string }>
  currentTopic?: string
  activeEntities: string[]
  conversationIntent?: string
  
  // Persistent facts relevant to current context
  relevantFacts: StructuredFact[]
  
  // Temporal context
  conversationStartedAt: Date
  lastMessageAt: Date
}

// ============================================================================
// CORE MEMORY OPERATIONS
// ============================================================================

/**
 * Store a structured fact in persistent memory
 */
export async function storeFact(fact: Omit<StructuredFact, 'id' | 'extractedAt' | 'validFrom' | 'isActive'>): Promise<StructuredFact> {
  console.log(`💾 [StructuredMemory] Storing fact: ${fact.factType} - ${fact.value}`)
  
  // Generate embedding for semantic search
  let embedding: number[] | undefined
  let embeddingJson: string | undefined
  
  if (fact.value && fact.value.trim()) {
    try {
      embedding = await generateEmbedding(fact.value)
      embeddingJson = JSON.stringify(embedding)
    } catch (error) {
      console.error('[StructuredMemory] Error generating embedding:', error)
      // Continue without embedding
    }
  }
  
  // Check for conflicts with existing facts
  const conflicts = await findConflictingFacts({
    botId: fact.botId,
    conversationId: fact.conversationId,
    entityName: fact.entityName,
    attribute: fact.attribute,
    excludeInactive: true
  })
  
  // Supersede conflicting facts
  const supersedesIds = conflicts.map(f => f.id)
  
  if (supersedesIds.length > 0) {
    console.log(`🔄 [StructuredMemory] Superseding ${supersedesIds.length} conflicting facts`)
    
    // Mark old facts as superseded
    await prisma.structuredFact.updateMany({
      where: { id: { in: supersedesIds } },
      data: {
        isActive: false,
        supersededBy: 'pending' // Will be updated with new fact ID
      }
    })
  }
  
  // Store new fact
  const stored = await prisma.structuredFact.create({
    data: {
      conversationId: fact.conversationId,
      botId: fact.botId,
      factType: fact.factType,
      category: fact.category,
      entityType: fact.entityType,
      entityName: fact.entityName,
      attribute: fact.attribute,
      value: fact.value,
      confidence: fact.confidence,
      source: fact.source,
      validUntil: fact.validUntil,
      supersedes: supersedesIds.length > 0 ? JSON.stringify(supersedesIds) : undefined,
      embedding: embeddingJson,
      embeddingModel: embeddingJson ? 'text-embedding-3-small' : undefined,
      intent: fact.intent,
      sentiment: fact.sentiment,
      importance: fact.importance,
      rawText: fact.rawText,
      extractionMethod: fact.extractionMethod,
      metadata: fact.metadata ? JSON.stringify(fact.metadata) : undefined
    }
  })
  
  // Update supersededBy field in old facts
  if (supersedesIds.length > 0) {
    await prisma.structuredFact.updateMany({
      where: { id: { in: supersedesIds } },
      data: { supersededBy: stored.id }
    })
  }
  
  console.log(`✅ [StructuredMemory] Fact stored with ID: ${stored.id}`)
  
  return convertPrismaToFact(stored)
}

/**
 * Find conflicting facts (same entity + attribute, active)
 */
async function findConflictingFacts(params: {
  botId: string
  conversationId: string
  entityName?: string
  attribute?: string
  excludeInactive?: boolean
}): Promise<StructuredFact[]> {
  if (!params.entityName || !params.attribute) {
    return []
  }
  
  const facts = await prisma.structuredFact.findMany({
    where: {
      botId: params.botId,
      conversationId: params.conversationId,
      entityName: params.entityName,
      attribute: params.attribute,
      isActive: params.excludeInactive ? true : undefined
    }
  })
  
  return facts.map(convertPrismaToFact)
}

/**
 * Query persistent memory with multi-dimensional filters
 */
export async function queryMemory(query: MemoryQuery): Promise<StructuredFact[]> {
  console.log(`🔍 [StructuredMemory] Querying memory for: "${query.query}"`)
  
  const validAt = query.validAt || new Date()
  
  // Build where clause
  const where: any = {
    botId: query.botId,
    conversationId: query.conversationId,
    isActive: query.includeInactive ? undefined : true,
    confidence: query.minConfidence ? { gte: query.minConfidence } : undefined,
    importance: query.minImportance ? { gte: query.minImportance } : undefined
  }
  
  // Add optional filters
  if (query.factTypes && query.factTypes.length > 0) {
    where.factType = { in: query.factTypes }
  }
  
  if (query.categories && query.categories.length > 0) {
    where.category = { in: query.categories }
  }
  
  if (query.entityTypes && query.entityTypes.length > 0) {
    where.entityType = { in: query.entityTypes }
  }
  
  if (query.entityNames && query.entityNames.length > 0) {
    where.entityName = { in: query.entityNames }
  }
  
  // Temporal validity
  where.validFrom = { lte: validAt }
  where.OR = [
    { validUntil: null },
    { validUntil: { gte: validAt } }
  ]
  
  // Retrieve facts
  let facts = await prisma.structuredFact.findMany({
    where,
    orderBy: [
      { importance: 'desc' },
      { confidence: 'desc' },
      { extractedAt: 'desc' }
    ],
    take: query.topK || 20
  })
  
  let convertedFacts = facts.map(convertPrismaToFact)
  
  // If semantic search enabled, rerank by similarity
  if (query.useSemanticSearch && query.query.trim()) {
    console.log(`🧠 [StructuredMemory] Reranking by semantic similarity`)
    convertedFacts = await rerankBySemanticSimilarity(query.query, convertedFacts)
  }
  
  console.log(`✅ [StructuredMemory] Retrieved ${convertedFacts.length} facts`)
  
  return convertedFacts.slice(0, query.topK || 10)
}

/**
 * Rerank facts by semantic similarity to query
 */
async function rerankBySemanticSimilarity(query: string, facts: StructuredFact[]): Promise<StructuredFact[]> {
  if (facts.length === 0) return facts
  
  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query)
    
    // Calculate cosine similarity for each fact
    const scoredFacts = facts
      .filter(fact => fact.embedding && fact.embedding.length > 0)
      .map(fact => ({
        fact,
        similarity: cosineSimilarity(queryEmbedding, fact.embedding!)
      }))
    
    // Sort by similarity (descending)
    scoredFacts.sort((a, b) => b.similarity - a.similarity)
    
    return scoredFacts.map(sf => sf.fact)
  } catch (error) {
    console.error('[StructuredMemory] Error in semantic reranking:', error)
    return facts // Return original order on error
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

/**
 * Build complete memory context for a conversation
 */
export async function buildMemoryContext(params: {
  conversationId: string
  botId: string
  recentMessages: Array<{ role: string; content: string }>
  currentQuery: string
  activeEntities?: string[]
  conversationIntent?: string
}): Promise<MemoryContext> {
  console.log(`🧠 [StructuredMemory] Building memory context for conversation ${params.conversationId}`)
  
  // Get conversation metadata
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: {
      startedAt: true,
      lastMessageAt: true,
      topicsDiscussed: true
    }
  })
  
  if (!conversation) {
    throw new Error(`Conversation ${params.conversationId} not found`)
  }
  
  // Extract entities from recent messages if not provided
  const activeEntities = params.activeEntities || extractEntitiesFromMessages(params.recentMessages)
  
  // Query relevant facts with multiple strategies
  const relevantFacts = await queryMemory({
    conversationId: params.conversationId,
    botId: params.botId,
    query: params.currentQuery,
    entityNames: activeEntities.length > 0 ? activeEntities : undefined,
    minConfidence: 0.6,
    minImportance: 3,
    topK: 10,
    useSemanticSearch: true
  })
  
  // Extract current topic from conversation
  const topics = conversation.topicsDiscussed ? JSON.parse(conversation.topicsDiscussed) : []
  const currentTopic = topics.length > 0 ? topics[topics.length - 1] : undefined
  
  return {
    recentMessages: params.recentMessages,
    currentTopic,
    activeEntities,
    conversationIntent: params.conversationIntent,
    relevantFacts,
    conversationStartedAt: conversation.startedAt,
    lastMessageAt: conversation.lastMessageAt || conversation.startedAt
  }
}

/**
 * Simple entity extraction from messages (will be improved by LLM later)
 */
function extractEntitiesFromMessages(messages: Array<{ role: string; content: string }>): string[] {
  const entities = new Set<string>()
  
  // Simple capitalized word detection (placeholder for proper NER)
  const capitalizedWordRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g
  
  for (const msg of messages) {
    const matches = msg.content.match(capitalizedWordRegex)
    if (matches) {
      matches.forEach(match => {
        // Filter out common words
        if (!['Il', 'La', 'Un', 'Una', 'Ho', 'Mi', 'Sono', 'Si', 'No'].includes(match)) {
          entities.add(match)
        }
      })
    }
  }
  
  return Array.from(entities).slice(0, 5) // Top 5 entities
}

/**
 * Deactivate facts (soft delete)
 */
export async function deactivateFacts(factIds: string[]): Promise<void> {
  await prisma.structuredFact.updateMany({
    where: { id: { in: factIds } },
    data: { isActive: false }
  })
  
  console.log(`🗑️ [StructuredMemory] Deactivated ${factIds.length} facts`)
}

/**
 * Get fact history for an entity
 */
export async function getFactHistory(params: {
  botId: string
  conversationId: string
  entityName: string
  attribute?: string
}): Promise<StructuredFact[]> {
  const facts = await prisma.structuredFact.findMany({
    where: {
      botId: params.botId,
      conversationId: params.conversationId,
      entityName: params.entityName,
      attribute: params.attribute
    },
    orderBy: { extractedAt: 'desc' }
  })
  
  return facts.map(convertPrismaToFact)
}

/**
 * Get memory statistics
 */
export async function getMemoryStats(botId: string, conversationId: string) {
  const total = await prisma.structuredFact.count({
    where: { botId, conversationId }
  })
  
  const active = await prisma.structuredFact.count({
    where: { botId, conversationId, isActive: true }
  })
  
  const byType = await prisma.structuredFact.groupBy({
    by: ['factType'],
    where: { botId, conversationId, isActive: true },
    _count: true
  })
  
  const byCategory = await prisma.structuredFact.groupBy({
    by: ['category'],
    where: { botId, conversationId, isActive: true },
    _count: true
  })
  
  return {
    total,
    active,
    inactive: total - active,
    byType: Object.fromEntries(byType.map(t => [t.factType, t._count])),
    byCategory: Object.fromEntries(byCategory.map(c => [c.category, c._count]))
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert Prisma model to StructuredFact interface
 */
function convertPrismaToFact(prismaFact: any): StructuredFact {
  return {
    id: prismaFact.id,
    conversationId: prismaFact.conversationId,
    botId: prismaFact.botId,
    factType: prismaFact.factType as FactType,
    category: prismaFact.category as FactCategory,
    entityType: prismaFact.entityType as EntityType | undefined,
    entityName: prismaFact.entityName || undefined,
    attribute: prismaFact.attribute || undefined,
    value: prismaFact.value,
    confidence: prismaFact.confidence,
    source: prismaFact.source as FactSource,
    extractedAt: prismaFact.extractedAt,
    validFrom: prismaFact.validFrom,
    validUntil: prismaFact.validUntil || undefined,
    isActive: prismaFact.isActive,
    supersedes: prismaFact.supersedes ? JSON.parse(prismaFact.supersedes) : undefined,
    supersededBy: prismaFact.supersededBy || undefined,
    embedding: prismaFact.embedding ? JSON.parse(prismaFact.embedding) : undefined,
    embeddingModel: prismaFact.embeddingModel || undefined,
    intent: prismaFact.intent || undefined,
    sentiment: prismaFact.sentiment || undefined,
    importance: prismaFact.importance,
    rawText: prismaFact.rawText || undefined,
    extractionMethod: prismaFact.extractionMethod || undefined,
    metadata: prismaFact.metadata ? JSON.parse(prismaFact.metadata) : undefined
  }
}

/**
 * Format facts for LLM prompt
 */
export function formatFactsForPrompt(facts: StructuredFact[]): string {
  if (facts.length === 0) return ''
  
  const factsByType = new Map<FactType, StructuredFact[]>()
  
  for (const fact of facts) {
    if (!factsByType.has(fact.factType)) {
      factsByType.set(fact.factType, [])
    }
    factsByType.get(fact.factType)!.push(fact)
  }
  
  let prompt = '# INFORMAZIONI MEMORIZZATE DALL\'UTENTE\n\n'
  
  for (const [type, typeFacts] of factsByType) {
    const typeLabel = {
      preference: 'Preferenze',
      profile: 'Profilo',
      decision: 'Decisioni',
      complaint: 'Problemi Segnalati',
      request: 'Richieste',
      feedback: 'Feedback'
    }[type] || type
    
    prompt += `## ${typeLabel}\n\n`
    
    for (const fact of typeFacts) {
      const entity = fact.entityName ? `**${fact.entityName}**` : ''
      const attribute = fact.attribute ? ` (${fact.attribute})` : ''
      const confidence = fact.confidence < 0.8 ? ` [${Math.round(fact.confidence * 100)}% sicuro]` : ''
      
      prompt += `- ${entity}${attribute}: ${fact.value}${confidence}\n`
    }
    
    prompt += '\n'
  }
  
  prompt += '**IMPORTANTE**: Usa queste informazioni per personalizzare la risposta quando rilevanti.\n'
  
  return prompt
}
