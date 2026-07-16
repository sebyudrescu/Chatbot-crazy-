/**
 * COHERENCE VALIDATOR - Validazione Coerenza e Risoluzione Conflitti
 * 
 * Verifica la coerenza tra diverse fonti di informazione PRIMA di passarle all'LLM:
 * 1. Temporal Validity: Informazioni ancora valide?
 * 2. Contradiction Detection: Ci sono conflitti tra fonti?
 * 3. Relevance Check: Le informazioni sono pertinenti al contesto attuale?
 * 4. Entity Consistency: Stiamo parlando della stessa cosa?
 * 5. Source Priority: In caso di conflitto, quale fonte prevale?
 * 
 * PRIORITÀ DI RISOLUZIONE:
 * 1. Contesto conversazionale corrente (ciò che l'utente ha appena detto)
 * 2. Fatti persistenti recenti (ciò che abbiamo imparato dall'utente)
 * 3. Fatti persistenti più vecchi
 * 4. Knowledge base aziendale (documenti statici)
 * 
 * @module coherence-validator
 */

import 'server-only'
import type { StructuredFact } from './structured-memory'

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationContext {
  // Current conversation state
  currentQuery: string
  currentTopic?: string
  mentionedEntities: string[]
  conversationIntent: string
  
  // Data to validate
  persistentFacts: StructuredFact[]
  knowledgeChunks: Array<{
    text: string
    score: number
    metadata: any
  }>
  
  // Conversation context (recent messages)
  recentMessages: Array<{ role: string; content: string }>
}

export interface ValidationResult {
  // Validated and cleaned data
  validatedFacts: StructuredFact[]
  validatedChunks: Array<{
    text: string
    score: number
    metadata: any
  }>
  
  // Conflicts detected
  conflicts: Conflict[]
  resolutions: Resolution[]
  
  // Warnings
  warnings: Warning[]
  
  // Summary
  isCoherent: boolean
  coherenceScore: number  // 0-1
  validationSummary: string
}

export interface Conflict {
  type: 'contradiction' | 'temporal_invalidity' | 'entity_mismatch' | 'topic_irrelevance'
  severity: 'high' | 'medium' | 'low'
  description: string
  affectedSources: Array<{
    type: 'fact' | 'chunk'
    id: string
    content: string
  }>
}

export interface Resolution {
  conflict: Conflict
  action: 'removed' | 'preferred' | 'merged' | 'ignored'
  reasoning: string
  preferredSource?: {
    type: 'fact' | 'chunk'
    id: string
  }
}

export interface Warning {
  type: 'low_relevance' | 'outdated' | 'ambiguous' | 'low_confidence'
  message: string
  source: {
    type: 'fact' | 'chunk'
    id: string
  }
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate coherence across all information sources
 */
export async function validateCoherence(context: ValidationContext): Promise<ValidationResult> {
  console.log(`🔍 [CoherenceValidator] Starting validation`)
  console.log(`   - ${context.persistentFacts.length} persistent facts`)
  console.log(`   - ${context.knowledgeChunks.length} KB chunks`)
  
  const conflicts: Conflict[] = []
  const resolutions: Resolution[] = []
  const warnings: Warning[] = []
  
  let validatedFacts = [...context.persistentFacts]
  let validatedChunks = [...context.knowledgeChunks]
  
  // === 1. TEMPORAL VALIDATION ===
  const { validFacts, invalidFacts } = validateTemporalValidity(validatedFacts)
  
  if (invalidFacts.length > 0) {
    console.log(`⏰ [CoherenceValidator] ${invalidFacts.length} facts are temporally invalid`)
    
    for (const fact of invalidFacts) {
      conflicts.push({
        type: 'temporal_invalidity',
        severity: 'medium',
        description: `Fatto scaduto: "${fact.value}"`,
        affectedSources: [{
          type: 'fact',
          id: fact.id,
          content: fact.value
        }]
      })
      
      resolutions.push({
        conflict: conflicts[conflicts.length - 1],
        action: 'removed',
        reasoning: 'Fatto oltre il periodo di validità (validUntil superato)'
      })
    }
  }
  
  validatedFacts = validFacts
  
  // === 2. RELEVANCE CHECK ===
  const { relevantFacts, irrelevantFacts } = checkFactRelevance(validatedFacts, context)
  
  if (irrelevantFacts.length > 0) {
    console.log(`🎯 [CoherenceValidator] ${irrelevantFacts.length} facts not relevant to current topic`)
    
    for (const fact of irrelevantFacts) {
      warnings.push({
        type: 'low_relevance',
        message: `Fatto non pertinente al topic corrente: "${fact.value}"`,
        source: { type: 'fact', id: fact.id }
      })
    }
  }
  
  validatedFacts = relevantFacts
  
  // === 3. ENTITY CONSISTENCY ===
  const entityIssues = checkEntityConsistency(validatedFacts, validatedChunks, context)
  
  if (entityIssues.length > 0) {
    console.log(`🔗 [CoherenceValidator] ${entityIssues.length} entity consistency issues`)
    conflicts.push(...entityIssues)
  }
  
  // === 4. CONTRADICTION DETECTION ===
  const contradictions = detectContradictions(validatedFacts, validatedChunks, context)
  
  if (contradictions.length > 0) {
    console.log(`⚠️ [CoherenceValidator] ${contradictions.length} contradictions detected`)
    
    for (const contradiction of contradictions) {
      conflicts.push(contradiction)
      
      // Resolve contradiction by prioritizing sources
      const resolution = resolveContradiction(contradiction, context)
      resolutions.push(resolution)
      
      // Apply resolution
      if (resolution.action === 'removed') {
        const sourceToRemove = contradiction.affectedSources.find(s => 
          s.id !== resolution.preferredSource?.id
        )
        
        if (sourceToRemove) {
          if (sourceToRemove.type === 'fact') {
            validatedFacts = validatedFacts.filter(f => f.id !== sourceToRemove.id)
          } else {
            validatedChunks = validatedChunks.filter(c => 
              `${c.metadata.sourceId}_chunk_${c.metadata.chunkIndex}` !== sourceToRemove.id
            )
          }
        }
      }
    }
  }
  
  // === 5. CONFIDENCE WARNINGS ===
  const lowConfidenceFacts = validatedFacts.filter(f => f.confidence < 0.7)
  
  for (const fact of lowConfidenceFacts) {
    warnings.push({
      type: 'low_confidence',
      message: `Fatto con bassa confidenza (${Math.round(fact.confidence * 100)}%): "${fact.value}"`,
      source: { type: 'fact', id: fact.id }
    })
  }
  
  // === 6. CALCULATE COHERENCE SCORE ===
  const coherenceScore = calculateCoherenceScore({
    totalFacts: context.persistentFacts.length,
    validFacts: validatedFacts.length,
    totalChunks: context.knowledgeChunks.length,
    validChunks: validatedChunks.length,
    conflicts: conflicts.length,
    warnings: warnings.length
  })
  
  const isCoherent = coherenceScore >= 0.7 && conflicts.filter(c => c.severity === 'high').length === 0
  
  // === 7. BUILD SUMMARY ===
  const validationSummary = buildValidationSummary({
    isCoherent,
    coherenceScore,
    conflicts,
    resolutions,
    warnings,
    validatedFacts,
    validatedChunks
  })
  
  console.log(`✅ [CoherenceValidator] Validation complete`)
  console.log(`   - Coherence Score: ${(coherenceScore * 100).toFixed(0)}%`)
  console.log(`   - Conflicts: ${conflicts.length}`)
  console.log(`   - Resolutions: ${resolutions.length}`)
  console.log(`   - Warnings: ${warnings.length}`)
  
  return {
    validatedFacts,
    validatedChunks,
    conflicts,
    resolutions,
    warnings,
    isCoherent,
    coherenceScore,
    validationSummary
  }
}

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

/**
 * Check temporal validity of facts
 */
function validateTemporalValidity(facts: StructuredFact[]): {
  validFacts: StructuredFact[]
  invalidFacts: StructuredFact[]
} {
  const now = new Date()
  const validFacts: StructuredFact[] = []
  const invalidFacts: StructuredFact[] = []
  
  for (const fact of facts) {
    // Check if fact is within validity period
    const isValid = fact.validFrom <= now && (!fact.validUntil || fact.validUntil >= now)
    
    if (isValid && fact.isActive) {
      validFacts.push(fact)
    } else {
      invalidFacts.push(fact)
    }
  }
  
  return { validFacts, invalidFacts }
}

/**
 * Check if facts are relevant to current conversation topic
 */
function checkFactRelevance(
  facts: StructuredFact[],
  context: ValidationContext
): {
  relevantFacts: StructuredFact[]
  irrelevantFacts: StructuredFact[]
} {
  const relevantFacts: StructuredFact[] = []
  const irrelevantFacts: StructuredFact[] = []
  
  const { currentQuery, currentTopic, mentionedEntities, conversationIntent } = context
  
  for (const fact of facts) {
    let relevanceScore = 0
    
    // 1. Entity match
    if (fact.entityName && mentionedEntities.some(e => 
      e.toLowerCase() === fact.entityName?.toLowerCase()
    )) {
      relevanceScore += 0.4
    }
    
    // 2. Category match with intent
    const intentCategoryMap: Record<string, string[]> = {
      'support': ['technical', 'support'],
      'sales': ['product', 'billing'],
      'complaint': ['support', 'service', 'technical'],
      'feedback': ['product', 'service'],
      'info': ['general', 'product']
    }
    
    const expectedCategories = intentCategoryMap[conversationIntent] || []
    if (expectedCategories.includes(fact.category)) {
      relevanceScore += 0.3
    }
    
    // 3. Semantic match (simple keyword overlap)
    const queryWords = currentQuery.toLowerCase().split(' ')
    const factWords = fact.value.toLowerCase().split(' ')
    const overlap = queryWords.filter(w => factWords.includes(w)).length
    if (overlap > 0) {
      relevanceScore += Math.min(0.3, overlap * 0.1)
    }
    
    // Decision: relevant if score > 0.3
    if (relevanceScore > 0.3 || fact.importance >= 8) {
      relevantFacts.push(fact)
    } else {
      irrelevantFacts.push(fact)
    }
  }
  
  return { relevantFacts, irrelevantFacts }
}

/**
 * Check entity consistency across sources
 */
function checkEntityConsistency(
  facts: StructuredFact[],
  chunks: any[],
  context: ValidationContext
): Conflict[] {
  const conflicts: Conflict[] = []
  
  // Group facts by entity
  const entitiesMentioned = new Set<string>()
  
  for (const fact of facts) {
    if (fact.entityName) {
      entitiesMentioned.add(fact.entityName.toLowerCase())
    }
  }
  
  // Check if mentioned entities in query match available entities
  const queryEntities = context.mentionedEntities.map(e => e.toLowerCase())
  
  for (const queryEntity of queryEntities) {
    const hasMatch = Array.from(entitiesMentioned).some(e => 
      e.includes(queryEntity) || queryEntity.includes(e)
    )
    
    if (!hasMatch && facts.length > 0) {
      conflicts.push({
        type: 'entity_mismatch',
        severity: 'low',
        description: `Entità menzionata nella query "${queryEntity}" non trovata nei fatti memorizzati`,
        affectedSources: []
      })
    }
  }
  
  return conflicts
}

/**
 * Detect contradictions between facts and KB chunks
 */
function detectContradictions(
  facts: StructuredFact[],
  chunks: any[],
  context: ValidationContext
): Conflict[] {
  const conflicts: Conflict[] = []
  
  // Check for contradictions between facts with same entity+attribute
  const factsByEntity = new Map<string, StructuredFact[]>()
  
  for (const fact of facts) {
    const key = `${fact.entityName || 'unknown'}_${fact.attribute || 'unknown'}`
    if (!factsByEntity.has(key)) {
      factsByEntity.set(key, [])
    }
    factsByEntity.get(key)!.push(fact)
  }
  
  // Detect contradicting facts
  for (const [key, entityFacts] of factsByEntity) {
    if (entityFacts.length > 1) {
      // Check if values are different
      const values = entityFacts.map(f => f.value.toLowerCase())
      const uniqueValues = new Set(values)
      
      if (uniqueValues.size > 1) {
        // Potential contradiction
        const mostRecent = entityFacts.sort((a, b) => 
          b.extractedAt.getTime() - a.extractedAt.getTime()
        )[0]
        
        const others = entityFacts.filter(f => f.id !== mostRecent.id)
        
        conflicts.push({
          type: 'contradiction',
          severity: 'high',
          description: `Contraddizione su ${key.split('_')[0]}: valori diversi trovati`,
          affectedSources: entityFacts.map(f => ({
            type: 'fact',
            id: f.id,
            content: f.value
          }))
        })
      }
    }
  }
  
  // Check for contradictions between recent messages and facts
  const recentUserStatements = context.recentMessages
    .filter(m => m.role === 'user')
    .slice(-2)
    .map(m => m.content.toLowerCase())
  
  for (const fact of facts) {
    const factValue = fact.value.toLowerCase()
    
    // Simple negation detection
    for (const statement of recentUserStatements) {
      const hasNegation = /\b(non|no|mai|nessun)\b/.test(statement)
      const mentionsEntity = fact.entityName && 
        statement.includes(fact.entityName.toLowerCase())
      
      if (hasNegation && mentionsEntity) {
        conflicts.push({
          type: 'contradiction',
          severity: 'high',
          description: `Possibile contraddizione: messaggio recente nega fatto memorizzato "${fact.value}"`,
          affectedSources: [{
            type: 'fact',
            id: fact.id,
            content: fact.value
          }]
        })
      }
    }
  }
  
  return conflicts
}

/**
 * Resolve contradiction by prioritizing sources
 * PRIORITY: Recent conversation > Recent facts > Old facts > KB
 */
function resolveContradiction(conflict: Conflict, context: ValidationContext): Resolution {
  if (conflict.affectedSources.length < 2) {
    return {
      conflict,
      action: 'ignored',
      reasoning: 'Non abbastanza fonti per risoluzione'
    }
  }
  
  // Find the most authoritative source
  // Priority: facts from recent conversation > older facts
  const factSources = conflict.affectedSources.filter(s => s.type === 'fact')
  
  if (factSources.length > 1) {
    // Prefer the most recent fact (already sorted by validation)
    const preferredSource = factSources[0]
    
    return {
      conflict,
      action: 'removed',
      reasoning: 'Rimossi fatti obsoleti, mantenuto il più recente',
      preferredSource: {
        type: preferredSource.type,
        id: preferredSource.id
      }
    }
  }
  
  return {
    conflict,
    action: 'ignored',
    reasoning: 'Conflitto non risolvibile automaticamente'
  }
}

/**
 * Calculate overall coherence score
 */
function calculateCoherenceScore(params: {
  totalFacts: number
  validFacts: number
  totalChunks: number
  validChunks: number
  conflicts: number
  warnings: number
}): number {
  const { totalFacts, validFacts, totalChunks, validChunks, conflicts, warnings } = params
  
  // Retention rate (how much data passed validation)
  const factRetention = totalFacts > 0 ? validFacts / totalFacts : 1
  const chunkRetention = totalChunks > 0 ? validChunks / totalChunks : 1
  const avgRetention = (factRetention + chunkRetention) / 2
  
  // Conflict penalty (max 0.5 penalty)
  const conflictPenalty = Math.min(0.5, conflicts * 0.1)
  
  // Warning penalty (max 0.2 penalty)
  const warningPenalty = Math.min(0.2, warnings * 0.05)
  
  // Calculate score
  const score = Math.max(0, avgRetention - conflictPenalty - warningPenalty)
  
  return score
}

/**
 * Build validation summary
 */
function buildValidationSummary(params: {
  isCoherent: boolean
  coherenceScore: number
  conflicts: Conflict[]
  resolutions: Resolution[]
  warnings: Warning[]
  validatedFacts: StructuredFact[]
  validatedChunks: any[]
}): string {
  const { isCoherent, coherenceScore, conflicts, resolutions, warnings, validatedFacts, validatedChunks } = params
  
  let summary = `## Validazione Coerenza\n\n`
  
  summary += `**Status**: ${isCoherent ? '✅ COERENTE' : '⚠️ ISSUES RILEVATI'}\n`
  summary += `**Coherence Score**: ${(coherenceScore * 100).toFixed(0)}%\n\n`
  
  if (validatedFacts.length > 0) {
    summary += `**Fatti Validati**: ${validatedFacts.length}\n`
  }
  
  if (validatedChunks.length > 0) {
    summary += `**Chunks KB Validati**: ${validatedChunks.length}\n`
  }
  
  if (conflicts.length > 0) {
    summary += `\n**Conflitti Rilevati**: ${conflicts.length}\n`
    for (const conflict of conflicts.slice(0, 3)) {
      summary += `- [${conflict.severity.toUpperCase()}] ${conflict.description}\n`
    }
  }
  
  if (resolutions.length > 0) {
    summary += `\n**Risoluzioni Applicate**: ${resolutions.length}\n`
  }
  
  if (warnings.length > 0) {
    summary += `\n**Warnings**: ${warnings.length}\n`
  }
  
  return summary
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format validation result for logging
 */
export function formatValidationForLog(result: ValidationResult): string {
  return `
Coherence Validation:
  - Coherent: ${result.isCoherent ? 'YES' : 'NO'}
  - Score: ${(result.coherenceScore * 100).toFixed(0)}%
  - Facts: ${result.validatedFacts.length}
  - Chunks: ${result.validatedChunks.length}
  - Conflicts: ${result.conflicts.length}
  - Warnings: ${result.warnings.length}
  `.trim()
}
