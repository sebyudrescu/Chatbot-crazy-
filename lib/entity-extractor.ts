/**
 * ENTITY & RELATION EXTRACTOR
 * 
 * Sistema per estrarre automaticamente entità e relazioni da:
 * 1. Knowledge Base (documenti, PDF, pagine web)
 * 2. Conversazioni utente
 * 3. Fatti strutturati esistenti
 * 
 * Usa LLM per identificare:
 * - Entità: prodotti, servizi, persone, aziende, feature, concetti
 * - Relazioni: collegamenti espliciti tra entità
 * - Attributi: proprietà delle entità (prezzo, caratteristiche, ecc.)
 * 
 * @module entity-extractor
 */

import 'server-only'
import { createLazyOpenAI } from './openai-client'
import { upsertEntity, upsertRelation, findEntity } from './knowledge-graph'
import { parseJSON } from './utils'

const openai = createLazyOpenAI()

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedEntity {
  type: string
  name: string
  displayName?: string
  aliases?: string[]
  attributes?: Record<string, any>
  description?: string
  category?: string
  confidence: number
}

export interface ExtractedRelation {
  sourceEntity: string
  relationType: string
  targetEntity: string
  attributes?: Record<string, any>
  confidence: number
}

export interface ExtractionResult {
  entities: ExtractedEntity[]
  relations: ExtractedRelation[]
  reasoning: string
}

// ============================================================================
// ENTITY & RELATION EXTRACTION FROM TEXT
// ============================================================================

/**
 * Extract entities and relations from text using LLM
 */
export async function extractEntitiesAndRelations(
  text: string,
  context?: {
    domain?: string
    existingEntities?: string[]
  }
): Promise<ExtractionResult> {
  const systemPrompt = `Sei un esperto nell'estrazione di entità e relazioni da testi business.

Il tuo compito è identificare:
1. ENTITÀ: prodotti, servizi, persone, aziende, feature, concetti importanti
2. RELAZIONI: collegamenti espliciti tra le entità

REGOLE:
- Estrai SOLO entità rilevanti per il business
- Normalizza i nomi (es: "iphone 15 pro" → "iPhone 15 Pro")
- Identifica attributi chiave (prezzo, caratteristiche, disponibilità)
- Trova relazioni esplicite (non inferire troppo)
- Assegna confidence score (0-1) basato su quanto l'informazione è chiara

TIPI DI ENTITÀ:
- product: prodotti fisici o digitali
- service: servizi offerti
- feature: caratteristiche/funzionalità
- person: persone (es: founder, CEO)
- company: aziende/organizzazioni
- location: luoghi fisici
- concept: concetti astratti importanti

TIPI DI RELAZIONI:
- HAS_FEATURE: prodotto ha una feature
- PART_OF: componente di qualcosa
- COMPATIBLE_WITH: compatibile con
- COSTS: ha un prezzo
- REQUIRES: richiede qualcosa
- REPLACES: sostituisce/aggiorna
- WORKS_WITH: funziona insieme a
- LOCATED_AT: si trova in

Rispondi in formato JSON:
{
  "entities": [
    {
      "type": "product",
      "name": "iPhone 15 Pro",
      "displayName": "iPhone 15 Pro",
      "aliases": ["iphone 15 pro", "iPhone15Pro"],
      "attributes": {"price": "1199", "storage": "256GB"},
      "description": "Smartphone premium di Apple",
      "category": "hardware",
      "confidence": 0.95
    }
  ],
  "relations": [
    {
      "sourceEntity": "iPhone 15 Pro",
      "relationType": "HAS_FEATURE",
      "targetEntity": "USB-C",
      "attributes": {},
      "confidence": 0.9
    }
  ],
  "reasoning": "Spiegazione breve di cosa hai estratto"
}`

  const userPrompt = `${context?.domain ? `DOMINIO: ${context.domain}\n\n` : ''}${
    context?.existingEntities
      ? `ENTITÀ ESISTENTI: ${context.existingEntities.join(', ')}\n\n`
      : ''
  }TESTO DA ANALIZZARE:\n\n${text}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0].message.content || '{}'
    let result: ExtractionResult
    try {
      result = JSON.parse(content)
    } catch {
      result = {
        entities: [],
        relations: [],
        reasoning: 'Failed to parse',
      }
    }

    console.log(
      `[EntityExtractor] Extracted ${result.entities.length} entities, ${result.relations.length} relations`
    )

    return result
  } catch (error: any) {
    console.error('[EntityExtractor] Error:', error.message)
    return {
      entities: [],
      relations: [],
      reasoning: `Extraction failed: ${error.message}`,
    }
  }
}

/**
 * Extract and save entities from knowledge base source
 */
export async function extractFromKnowledgeBase(
  botId: string,
  sourceId: string,
  content: string,
  context?: {
    domain?: string
  }
): Promise<{
  entitiesCreated: number
  relationsCreated: number
}> {
  console.log(`[EntityExtractor] Processing KB source ${sourceId}`)

  // Split content into chunks if too large
  const maxChunkSize = 4000
  const chunks =
    content.length > maxChunkSize
      ? splitIntoChunks(content, maxChunkSize)
      : [content]

  let totalEntities = 0
  let totalRelations = 0
  const entityNameToId = new Map<string, string>()

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    console.log(`[EntityExtractor] Processing chunk ${i + 1}/${chunks.length}`)

    // Extract entities and relations
    const extraction = await extractEntitiesAndRelations(chunk, {
      domain: context?.domain,
      existingEntities: Array.from(entityNameToId.keys()),
    })

    // Save entities
    for (const entity of extraction.entities) {
      try {
        const saved = await upsertEntity(botId, {
          entityType: entity.type,
          entityName: entity.name,
          displayName: entity.displayName,
          aliases: entity.aliases,
          attributes: entity.attributes,
          description: entity.description,
          category: entity.category,
          confidence: entity.confidence,
          extractedFrom: `knowledge_base:${sourceId}`,
        })

        entityNameToId.set(entity.name, saved.id)
        totalEntities++
      } catch (error: any) {
        console.error(`[EntityExtractor] Failed to save entity ${entity.name}:`, error.message)
      }
    }

    // Save relations
    for (const relation of extraction.relations) {
      try {
        // Find or create source entity
        let sourceId = entityNameToId.get(relation.sourceEntity)
        if (!sourceId) {
          const found = await findEntity(botId, relation.sourceEntity)
          if (found) {
            sourceId = found.id
            entityNameToId.set(relation.sourceEntity, sourceId)
          }
        }

        // Find or create target entity
        let targetId = entityNameToId.get(relation.targetEntity)
        if (!targetId) {
          const found = await findEntity(botId, relation.targetEntity)
          if (found) {
            targetId = found.id
            entityNameToId.set(relation.targetEntity, targetId)
          }
        }

        if (sourceId && targetId) {
          await upsertRelation(botId, {
            sourceEntityId: sourceId,
            relationType: relation.relationType,
            targetEntityId: targetId,
            attributes: relation.attributes,
            confidence: relation.confidence,
            extractedFrom: `knowledge_base:${sourceId}`,
          })

          totalRelations++
        }
      } catch (error: any) {
        console.error(
          `[EntityExtractor] Failed to save relation ${relation.sourceEntity} -> ${relation.targetEntity}:`,
          error.message
        )
      }
    }
  }

  console.log(
    `[EntityExtractor] ✅ Created ${totalEntities} entities, ${totalRelations} relations`
  )

  return {
    entitiesCreated: totalEntities,
    relationsCreated: totalRelations,
  }
}

/**
 * Extract entities from conversation
 * Focus on user preferences, mentions, and context
 */
export async function extractFromConversation(
  botId: string,
  conversationId: string,
  messages: Array<{ role: string; content: string }>
): Promise<{
  entitiesCreated: number
  relationsCreated: number
}> {
  console.log(`[EntityExtractor] Processing conversation ${conversationId}`)

  // Build conversation text
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n')

  // Extract with conversation context
  const extraction = await extractEntitiesAndRelations(conversationText, {
    domain: 'conversation',
  })

  let totalEntities = 0
  let totalRelations = 0
  const entityNameToId = new Map<string, string>()

  // Save entities (focus on user-related entities)
  for (const entity of extraction.entities) {
    // Skip generic entities in conversations
    if (entity.type === 'concept' && entity.confidence < 0.8) continue

    try {
      const saved = await upsertEntity(botId, {
        entityType: entity.type,
        entityName: entity.name,
        displayName: entity.displayName,
        aliases: entity.aliases,
        attributes: entity.attributes,
        description: entity.description,
        category: entity.category,
        confidence: entity.confidence * 0.9, // Slightly lower confidence for conversation entities
        extractedFrom: `conversation:${conversationId}`,
        tags: ['from_conversation'],
      })

      entityNameToId.set(entity.name, saved.id)
      totalEntities++
    } catch (error: any) {
      console.error(`[EntityExtractor] Failed to save entity:`, error.message)
    }
  }

  // Save relations
  for (const relation of extraction.relations) {
    try {
      let sourceId = entityNameToId.get(relation.sourceEntity)
      if (!sourceId) {
        const found = await findEntity(botId, relation.sourceEntity)
        if (found) sourceId = found.id
      }

      let targetId = entityNameToId.get(relation.targetEntity)
      if (!targetId) {
        const found = await findEntity(botId, relation.targetEntity)
        if (found) targetId = found.id
      }

      if (sourceId && targetId) {
        await upsertRelation(botId, {
          sourceEntityId: sourceId,
          relationType: relation.relationType,
          targetEntityId: targetId,
          attributes: relation.attributes,
          confidence: relation.confidence * 0.9,
          extractedFrom: `conversation:${conversationId}`,
        })

        totalRelations++
      }
    } catch (error: any) {
      console.error(`[EntityExtractor] Failed to save relation:`, error.message)
    }
  }

  console.log(
    `[EntityExtractor] ✅ Created ${totalEntities} entities, ${totalRelations} relations from conversation`
  )

  return {
    entitiesCreated: totalEntities,
    relationsCreated: totalRelations,
  }
}

/**
 * Quick entity extraction (for real-time queries)
 * Extracts only entity names without full LLM processing
 */
export async function extractEntityMentions(text: string): Promise<string[]> {
  // Simple regex-based extraction for quick detection
  const mentions: string[] = []

  // Product patterns (common formats)
  const productPatterns = [
    /\b[A-Z][a-z]+ \d+( [A-Z][a-z]+)?\b/g, // iPhone 15 Pro, Galaxy S24
    /\b[A-Z]{2,}\s*\d+[A-Z]?\b/g, // M1, A15, USB-C
  ]

  for (const pattern of productPatterns) {
    const matches = text.match(pattern)
    if (matches) {
      mentions.push(...matches)
    }
  }

  // Deduplicate
  return Array.from(new Set(mentions))
}

/**
 * Build relation between user and entity (preference, interest)
 */
export async function linkUserToEntity(
  botId: string,
  conversationId: string,
  userId: string,
  entityName: string,
  relationType: 'INTERESTED_IN' | 'PREFERS' | 'OWNS' | 'DISLIKES',
  confidence: number = 0.8
): Promise<void> {
  // Find or create user entity
  let userEntity = await findEntity(botId, userId, 'person')
  if (!userEntity) {
    userEntity = await upsertEntity(botId, {
      entityType: 'person',
      entityName: userId,
      displayName: userId,
      category: 'user',
      confidence: 1.0,
      extractedFrom: `conversation:${conversationId}`,
    })
  }

  // Find target entity
  const targetEntity = await findEntity(botId, entityName)
  if (!targetEntity) {
    console.warn(`[EntityExtractor] Entity not found: ${entityName}`)
    return
  }

  // Create relation
  await upsertRelation(botId, {
    sourceEntityId: userEntity.id,
    relationType: relationType,
    targetEntityId: targetEntity.id,
    confidence,
    extractedFrom: `conversation:${conversationId}`,
  })

  console.log(`[EntityExtractor] ✅ Linked ${userId} --[${relationType}]--> ${entityName}`)
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function splitIntoChunks(text: string, maxSize: number): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\n+/)

  let currentChunk = ''

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > maxSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }

      // If single paragraph is too large, split by sentences
      if (paragraph.length > maxSize) {
        const sentences = paragraph.split(/\.\s+/)
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > maxSize) {
            if (currentChunk) {
              chunks.push(currentChunk.trim())
            }
            currentChunk = sentence
          } else {
            currentChunk += (currentChunk ? '. ' : '') + sentence
          }
        }
      } else {
        currentChunk = paragraph
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}
