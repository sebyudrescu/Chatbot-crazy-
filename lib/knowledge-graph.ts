/**
 * KNOWLEDGE GRAPH MANAGER
 * 
 * Sistema per gestire entità e relazioni esplicite.
 * Questo layer permette al chatbot di ragionare su connessioni
 * che la similarità semantica da sola non può catturare.
 * 
 * Responsabilità:
 * 1. CRUD operations su entità e relazioni
 * 2. Query graph-based per trovare connessioni
 * 3. Path finding tra entità
 * 4. Reasoning su relazioni multiple
 * 
 * @module knowledge-graph
 */

import 'server-only'
import { prisma } from './db'
import { generateEmbedding } from './embeddings'
import { parseJSON } from './utils'

// ============================================================================
// TYPES
// ============================================================================

export interface EntityData {
  entityType: string
  entityName: string
  displayName?: string
  aliases?: string[]
  attributes?: Record<string, any>
  description?: string
  category?: string
  confidence?: number
  extractedFrom?: string
  tags?: string[]
  metadata?: Record<string, any>
}

export interface RelationData {
  sourceEntityId: string
  relationType: string
  targetEntityId: string
  attributes?: Record<string, any>
  strength?: number
  bidirectional?: boolean
  confidence?: number
  extractedFrom?: string
  validUntil?: Date
  metadata?: Record<string, any>
}

export interface GraphEntity {
  id: string
  entityType: string
  entityName: string
  displayName?: string | null
  aliases: string[]
  attributes: Record<string, any>
  description?: string | null
  category?: string | null
  confidence: number
  tags: string[]
}

export interface GraphRelation {
  id: string
  sourceEntityId: string
  relationType: string
  targetEntityId: string
  attributes: Record<string, any>
  strength: number
  bidirectional: boolean
  confidence: number
}

export interface GraphPath {
  entities: GraphEntity[]
  relations: GraphRelation[]
  pathLength: number
  totalStrength: number
}

// ============================================================================
// ENTITY MANAGEMENT
// ============================================================================

/**
 * Create or update an entity in the knowledge graph
 */
export async function upsertEntity(
  botId: string,
  data: EntityData
): Promise<GraphEntity> {
  // Generate embedding for semantic search
  const embeddingText = `${data.entityName} ${data.displayName || ''} ${data.description || ''}`.trim()
  const embedding = await generateEmbedding(embeddingText)

  const entity = await prisma.entity.upsert({
    where: {
      botId_entityType_entityName: {
        botId,
        entityType: data.entityType,
        entityName: data.entityName,
      },
    },
    update: {
      displayName: data.displayName,
      aliases: data.aliases ? JSON.stringify(data.aliases) : null,
      attributes: data.attributes ? JSON.stringify(data.attributes) : null,
      description: data.description,
      category: data.category,
      confidence: data.confidence ?? 1.0,
      extractedFrom: data.extractedFrom,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      embedding: JSON.stringify(embedding),
      embeddingModel: 'text-embedding-3-small',
      updatedAt: new Date(),
    },
    create: {
      botId,
      entityType: data.entityType,
      entityName: data.entityName,
      displayName: data.displayName,
      aliases: data.aliases ? JSON.stringify(data.aliases) : null,
      attributes: data.attributes ? JSON.stringify(data.attributes) : null,
      description: data.description,
      category: data.category,
      confidence: data.confidence ?? 1.0,
      extractedFrom: data.extractedFrom,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      embedding: JSON.stringify(embedding),
      embeddingModel: 'text-embedding-3-small',
    },
  })

  return formatEntity(entity)
}

/**
 * Find entity by name (exact or alias match)
 */
export async function findEntity(
  botId: string,
  entityName: string,
  entityType?: string
): Promise<GraphEntity | null> {
  const normalizedName = entityName.toLowerCase().trim()

  // Try exact match first
  const entities = await prisma.entity.findMany({
    where: {
      botId,
      entityType: entityType,
      isActive: true,
      OR: [
        { entityName: { contains: normalizedName, mode: 'insensitive' } },
      ],
    },
  })

  // Check aliases
  for (const entity of entities) {
    const aliases = parseJSON<string[]>(entity.aliases) || []
    if (
      entity.entityName.toLowerCase() === normalizedName ||
      aliases.some(alias => alias.toLowerCase() === normalizedName)
    ) {
      return formatEntity(entity)
    }
  }

  return entities.length > 0 ? formatEntity(entities[0]) : null
}

/**
 * Get entity by ID
 */
export async function getEntity(entityId: string): Promise<GraphEntity | null> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
  })

  return entity ? formatEntity(entity) : null
}

/**
 * Find entities by type
 */
export async function findEntitiesByType(
  botId: string,
  entityType: string
): Promise<GraphEntity[]> {
  const entities = await prisma.entity.findMany({
    where: {
      botId,
      entityType,
      isActive: true,
    },
    orderBy: { confidence: 'desc' },
  })

  return entities.map(formatEntity)
}

/**
 * Search entities semantically
 */
export async function searchEntities(
  botId: string,
  query: string,
  options: {
    entityType?: string
    topK?: number
    minScore?: number
  } = {}
): Promise<Array<GraphEntity & { score: number }>> {
  const { entityType, topK = 10, minScore = 0.7 } = options

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query)

  // Get all entities
  const entities = await prisma.entity.findMany({
    where: {
      botId,
      entityType: entityType,
      isActive: true,
      embedding: { not: null },
    },
  })

  // Calculate similarity scores
  const results = entities
    .map(entity => {
      const embedding = parseJSON<number[]>(entity.embedding) || []
      const score = cosineSimilarity(queryEmbedding, embedding)
      return { entity: formatEntity(entity), score }
    })
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return results.map(r => ({ ...r.entity, score: r.score }))
}

// ============================================================================
// RELATION MANAGEMENT
// ============================================================================

/**
 * Create or update a relation in the knowledge graph
 */
export async function upsertRelation(
  botId: string,
  data: RelationData
): Promise<GraphRelation> {
  const relation = await prisma.relation.upsert({
    where: {
      botId_sourceEntityId_relationType_targetEntityId: {
        botId,
        sourceEntityId: data.sourceEntityId,
        relationType: data.relationType,
        targetEntityId: data.targetEntityId,
      },
    },
    update: {
      attributes: data.attributes ? JSON.stringify(data.attributes) : null,
      strength: data.strength ?? 1.0,
      bidirectional: data.bidirectional ?? false,
      confidence: data.confidence ?? 1.0,
      extractedFrom: data.extractedFrom,
      validUntil: data.validUntil,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      updatedAt: new Date(),
    },
    create: {
      botId,
      sourceEntityId: data.sourceEntityId,
      relationType: data.relationType,
      targetEntityId: data.targetEntityId,
      attributes: data.attributes ? JSON.stringify(data.attributes) : null,
      strength: data.strength ?? 1.0,
      bidirectional: data.bidirectional ?? false,
      confidence: data.confidence ?? 1.0,
      extractedFrom: data.extractedFrom,
      validUntil: data.validUntil,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    },
  })

  return formatRelation(relation)
}

/**
 * Get relations for an entity
 */
export async function getEntityRelations(
  entityId: string,
  options: {
    relationType?: string
    direction?: 'outgoing' | 'incoming' | 'both'
  } = {}
): Promise<GraphRelation[]> {
  const { relationType, direction = 'both' } = options

  const where: any = {
    isActive: true,
    relationType: relationType,
  }

  if (direction === 'outgoing' || direction === 'both') {
    const outgoing = await prisma.relation.findMany({
      where: { ...where, sourceEntityId: entityId },
      orderBy: { strength: 'desc' },
    })

    if (direction === 'outgoing') {
      return outgoing.map(formatRelation)
    }

    const incoming =
      direction === 'both'
        ? await prisma.relation.findMany({
            where: { ...where, targetEntityId: entityId },
            orderBy: { strength: 'desc' },
          })
        : []

    return [...outgoing, ...incoming].map(formatRelation)
  }

  // incoming only
  const incoming = await prisma.relation.findMany({
    where: { ...where, targetEntityId: entityId },
    orderBy: { strength: 'desc' },
  })

  return incoming.map(formatRelation)
}

/**
 * Get related entities (one hop)
 */
export async function getRelatedEntities(
  entityId: string,
  options: {
    relationType?: string
    direction?: 'outgoing' | 'incoming' | 'both'
  } = {}
): Promise<Array<{ entity: GraphEntity; relation: GraphRelation }>> {
  const relations = await getEntityRelations(entityId, options)
  const { direction = 'both' } = options

  const results: Array<{ entity: GraphEntity; relation: GraphRelation }> = []

  for (const relation of relations) {
    // Determine which entity to fetch
    const targetId =
      relation.sourceEntityId === entityId
        ? relation.targetEntityId
        : relation.sourceEntityId

    const entity = await getEntity(targetId)
    if (entity) {
      results.push({ entity, relation })
    }
  }

  return results
}

// ============================================================================
// GRAPH QUERIES & REASONING
// ============================================================================

/**
 * Find path between two entities (BFS)
 */
export async function findPath(
  startEntityId: string,
  endEntityId: string,
  maxDepth: number = 3
): Promise<GraphPath | null> {
  if (startEntityId === endEntityId) {
    const entity = await getEntity(startEntityId)
    if (!entity) return null
    
    return {
      entities: [entity],
      relations: [],
      pathLength: 0,
      totalStrength: 1.0,
    }
  }

  // BFS to find shortest path
  const queue: Array<{
    entityId: string
    path: string[]
    relations: GraphRelation[]
  }> = [{ entityId: startEntityId, path: [startEntityId], relations: [] }]

  const visited = new Set<string>([startEntityId])

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current.path.length > maxDepth) continue

    // Get related entities
    const related = await getRelatedEntities(current.entityId)

    for (const { entity, relation } of related) {
      if (visited.has(entity.id)) continue

      const newPath = [...current.path, entity.id]
      const newRelations = [...current.relations, relation]

      if (entity.id === endEntityId) {
        // Found path! Build result
        const entities: GraphEntity[] = []
        for (const id of newPath) {
          const e = await getEntity(id)
          if (e) entities.push(e)
        }

        const totalStrength =
          newRelations.reduce((sum, r) => sum + r.strength, 0) /
          newRelations.length

        return {
          entities,
          relations: newRelations,
          pathLength: newRelations.length,
          totalStrength,
        }
      }

      visited.add(entity.id)
      queue.push({
        entityId: entity.id,
        path: newPath,
        relations: newRelations,
      })
    }
  }

  return null // No path found
}

/**
 * Find all entities with specific relation to target
 * Example: "What products have feature X?"
 */
export async function findEntitiesWithRelation(
  botId: string,
  relationType: string,
  targetEntityId: string
): Promise<GraphEntity[]> {
  const relations = await prisma.relation.findMany({
    where: {
      botId,
      relationType,
      targetEntityId,
      isActive: true,
    },
    include: {
      sourceEntity: true,
    },
  })

  return relations.map(r => formatEntity(r.sourceEntity))
}

/**
 * Get entity neighborhood (all connected entities within N hops)
 */
export async function getEntityNeighborhood(
  entityId: string,
  maxHops: number = 2
): Promise<{
  entities: GraphEntity[]
  relations: GraphRelation[]
}> {
  const entities = new Map<string, GraphEntity>()
  const relations = new Map<string, GraphRelation>()
  const visited = new Set<string>()

  async function explore(currentId: string, depth: number) {
    if (depth > maxHops || visited.has(currentId)) return

    visited.add(currentId)

    const entity = await getEntity(currentId)
    if (entity) {
      entities.set(entity.id, entity)
    }

    const related = await getRelatedEntities(currentId)
    for (const { entity: relEntity, relation } of related) {
      entities.set(relEntity.id, relEntity)
      relations.set(relation.id, relation)

      if (depth < maxHops) {
        await explore(relEntity.id, depth + 1)
      }
    }
  }

  await explore(entityId, 0)

  return {
    entities: Array.from(entities.values()),
    relations: Array.from(relations.values()),
  }
}

/**
 * Query graph with natural language
 * Uses entity extraction + relation matching
 */
export async function queryGraph(
  botId: string,
  query: string
): Promise<{
  entities: GraphEntity[]
  relations: GraphRelation[]
  reasoning: string
}> {
  // Search for relevant entities
  const entities = await searchEntities(botId, query, { topK: 5, minScore: 0.6 })

  if (entities.length === 0) {
    return { entities: [], relations: [], reasoning: 'No relevant entities found' }
  }

  // Get relations for top entities
  const relations: GraphRelation[] = []
  const relatedEntities = new Map<string, GraphEntity>()

  for (const entity of entities.slice(0, 3)) {
    const entityRelations = await getEntityRelations(entity.id)
    relations.push(...entityRelations)

    // Get related entities
    const related = await getRelatedEntities(entity.id)
    for (const { entity: relEntity } of related) {
      relatedEntities.set(relEntity.id, relEntity)
    }
  }

  const allEntities = [
    ...entities,
    ...Array.from(relatedEntities.values()),
  ]

  const reasoning = `Found ${entities.length} relevant entities and ${relations.length} relations based on semantic search`

  return {
    entities: allEntities,
    relations,
    reasoning,
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatEntity(entity: any): GraphEntity {
  return {
    id: entity.id,
    entityType: entity.entityType,
    entityName: entity.entityName,
    displayName: entity.displayName,
    aliases: parseJSON<string[]>(entity.aliases) || [],
    attributes: parseJSON<Record<string, any>>(entity.attributes) || {},
    description: entity.description,
    category: entity.category,
    confidence: entity.confidence,
    tags: parseJSON<string[]>(entity.tags) || [],
  }
}

function formatRelation(relation: any): GraphRelation {
  return {
    id: relation.id,
    sourceEntityId: relation.sourceEntityId,
    relationType: relation.relationType,
    targetEntityId: relation.targetEntityId,
    attributes: parseJSON<Record<string, any>>(relation.attributes) || {},
    strength: relation.strength,
    bidirectional: relation.bidirectional,
    confidence: relation.confidence,
  }
}

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

  if (normA === 0 || normB === 0) return 0

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
