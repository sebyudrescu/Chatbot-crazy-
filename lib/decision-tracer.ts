/**
 * DECISION TRACER
 * 
 * Sistema per tracciare e spiegare le decisioni del chatbot in modo umano-leggibile.
 * 
 * Obiettivi:
 * - Capire PERCHÉ una strategia è stata scelta
 * - Vedere quali alternative sono state considerate e scartate
 * - Identificare conflitti o incertezze nella decisione
 * - Debug rapido e tuning del sistema
 * 
 * Riusa:
 * - Event Store già esistente
 * - Decision Layer esistente
 * - Strutture di logging già in uso
 * 
 * @module decision-tracer
 */

import 'server-only'
import { prisma } from './db'
import { eventStore } from './event-store'
import type { IntentResult } from './intent-classifier'
import type { QueryClassification } from './query-classifier'

// ============================================================================
// TYPES
// ============================================================================

export interface DecisionReasoning {
  // Main decision
  strategy: string
  why: string
  
  // Factors that influenced the decision
  factors: Array<{
    factor: string
    weight: number // 0-1
    impact: 'positive' | 'negative' | 'neutral'
  }>
  
  // Alternatives considered
  alternatives: Array<{
    strategy: string
    considered: boolean
    score: number // 0-1
    rejected?: string
    wouldHaveChosen?: boolean
  }>
  
  // Confidence and warnings
  confidence: number
  warnings: string[]
  uncertainties: string[]
}

export interface SourceUsage {
  source: 'persistent_memory' | 'knowledge_base' | 'knowledge_graph' | 'context'
  used: boolean
  reason?: string
  resultsCount?: number
  topScore?: number
  examples?: string[]
}

export interface DecisionTrace {
  // Identifiers
  messageId: string
  conversationId: string
  botId: string
  timestamp: Date
  
  // Input
  query: string
  
  // Understanding phase
  understanding: {
    intent: string
    intentConfidence: number
    intentReasoning: string
    queryType: string
    queryComplexity: string
    entities: string[]
    topics: string[]
  }
  
  // Decision phase
  decision: DecisionReasoning
  
  // Retrieval phase
  retrieval: {
    sourcesUsed: SourceUsage[]
    totalResults: number
    processingTime: number
  }
  
  // Validation phase
  validation?: {
    coherenceCheck: {
      passed: boolean
      score: number
      conflicts: number
      warnings: string[]
    }
    confidenceCheck: {
      passed: boolean
      score: number
      threshold: number
    }
  }
  
  // Generation phase
  generation: {
    model: string
    temperature: number
    tokensUsed?: number
    processingTime: number
  }
  
  // Learning phase
  learning: {
    factsExtracted: number
    entitiesCreated: number
    relationsCreated: number
  }
  
  // Overall outcome
  outcome: {
    success: boolean
    overallConfidence: number
    responseLength: number
    totalProcessingTime: number
  }
  
  // Issues and recommendations
  issues: Array<{
    severity: 'info' | 'warning' | 'error'
    message: string
    suggestion?: string
  }>
}

// ============================================================================
// DECISION REASONING BUILDER
// ============================================================================

/**
 * Build decision reasoning from intent and classification
 */
export function buildDecisionReasoning(params: {
  intent: IntentResult
  queryClassification: QueryClassification
  entities: string[]
  topics: string[]
  conversationLength: number
  finalStrategy: string
}): DecisionReasoning {
  const { intent, queryClassification, entities, topics, conversationLength, finalStrategy } = params
  
  const factors: DecisionReasoning['factors'] = []
  const alternatives: DecisionReasoning['alternatives'] = []
  const warnings: string[] = []
  const uncertainties: string[] = []
  
  // Analyze factors
  
  // Factor 1: Intent confidence
  factors.push({
    factor: `Intent "${intent.intent}" with ${(intent.confidence * 100).toFixed(0)}% confidence`,
    weight: intent.confidence,
    impact: intent.confidence > 0.8 ? 'positive' : intent.confidence > 0.5 ? 'neutral' : 'negative'
  })
  
  if (intent.confidence < 0.7) {
    warnings.push(`Intent confidence is low (${(intent.confidence * 100).toFixed(0)}%)`)
    uncertainties.push('Intent classification may be inaccurate')
  }
  
  // Factor 2: Query complexity
  factors.push({
    factor: `Query is ${queryClassification.complexity} ${queryClassification.type}`,
    weight: queryClassification.complexity === 'simple' ? 0.8 : queryClassification.complexity === 'medium' ? 0.6 : 0.4,
    impact: queryClassification.complexity === 'simple' ? 'positive' : 'neutral'
  })
  
  // Factor 3: Entities present
  if (entities.length > 0) {
    factors.push({
      factor: `Contains ${entities.length} entities: ${entities.slice(0, 3).join(', ')}${entities.length > 3 ? '...' : ''}`,
      weight: Math.min(entities.length * 0.2, 0.9),
      impact: 'positive'
    })
  } else {
    factors.push({
      factor: 'No specific entities detected',
      weight: 0.3,
      impact: 'negative'
    })
    
    if (queryClassification.type === 'factual') {
      warnings.push('Factual query without entities may not retrieve relevant information')
    }
  }
  
  // Factor 4: Conversation context
  if (conversationLength > 2) {
    factors.push({
      factor: `Active conversation (${conversationLength} messages)`,
      weight: Math.min(conversationLength * 0.1, 0.8),
      impact: 'positive'
    })
  }
  
  // Factor 5: Topics
  if (topics.length > 0) {
    factors.push({
      factor: `Related topics: ${topics.slice(0, 2).join(', ')}`,
      weight: 0.6,
      impact: 'positive'
    })
  }
  
  // Evaluate alternatives and build reasoning
  const isRelational = queryClassification.type === 'factual' && entities.length > 0
  const hasMemoryContext = conversationLength > 2
  
  // Alternative 1: Conversational
  const conversationalScore = intent.intent === 'greeting' || intent.intent === 'chitchat' ? 0.9 : 0.2
  alternatives.push({
    strategy: 'conversational',
    considered: true,
    score: conversationalScore,
    rejected: conversationalScore < 0.5 ? 'Requires information retrieval' : undefined,
    wouldHaveChosen: finalStrategy === 'conversational'
  })
  
  // Alternative 2: Graph Reasoning
  const graphScore = isRelational && entities.length > 0 ? 0.9 : entities.length > 0 ? 0.5 : 0.1
  alternatives.push({
    strategy: 'graph_reasoning',
    considered: entities.length > 0,
    score: graphScore,
    rejected: entities.length === 0 ? 'No entities to connect' : graphScore < 0.5 ? 'Not a relational query' : undefined,
    wouldHaveChosen: finalStrategy === 'graph_reasoning'
  })
  
  // Alternative 3: RAG Enhanced
  const ragScore = intent.shouldUseRAG ? 0.8 : 0.3
  alternatives.push({
    strategy: 'rag_enhanced',
    considered: true,
    score: ragScore,
    rejected: !intent.shouldUseRAG ? 'No need for knowledge base' : ragScore < 0.5 ? 'Other strategies more appropriate' : undefined,
    wouldHaveChosen: finalStrategy === 'rag_enhanced'
  })
  
  // Alternative 4: Memory Personalized
  const memoryScore = hasMemoryContext ? 0.7 : 0.2
  alternatives.push({
    strategy: 'memory_personalized',
    considered: hasMemoryContext,
    score: memoryScore,
    rejected: !hasMemoryContext ? 'Not enough conversation history' : memoryScore < 0.5 ? 'Fresh query needs KB' : undefined,
    wouldHaveChosen: finalStrategy === 'memory_personalized'
  })
  
  // Alternative 5: Hybrid
  const hybridScore = entities.length > 0 && intent.shouldUseRAG ? 0.85 : 0.4
  alternatives.push({
    strategy: 'hybrid',
    considered: entities.length > 0,
    score: hybridScore,
    rejected: hybridScore < 0.5 ? 'Single source sufficient' : undefined,
    wouldHaveChosen: finalStrategy === 'hybrid'
  })
  
  // Build main reasoning
  let why = ''
  
  switch (finalStrategy) {
    case 'conversational':
      why = `Intent is conversational (${intent.intent}), no need for information retrieval`
      break
    case 'graph_reasoning':
      why = `Query asks about relationships/features with known entities. Knowledge graph provides structured connections.`
      break
    case 'rag_enhanced':
      why = `Factual query requiring knowledge base lookup. No specific entities or relationships.`
      break
    case 'memory_personalized':
      why = `Simple query in active conversation. User's persistent memory is most relevant.`
      break
    case 'hybrid':
      why = `Query has entities and requires both knowledge base and user memory for comprehensive answer.`
      break
    default:
      why = `Selected based on query characteristics and available context`
  }
  
  // Calculate overall confidence
  const topAlternative = alternatives.find(a => a.wouldHaveChosen)
  const confidence = topAlternative?.score || 0.5
  
  // Check for decision uncertainty
  const closeAlternatives = alternatives.filter(a => !a.wouldHaveChosen && a.score > confidence - 0.15)
  if (closeAlternatives.length > 0) {
    uncertainties.push(
      `Close alternatives: ${closeAlternatives.map(a => `${a.strategy} (${(a.score * 100).toFixed(0)}%)`).join(', ')}`
    )
  }
  
  return {
    strategy: finalStrategy,
    why,
    factors,
    alternatives: alternatives.sort((a, b) => b.score - a.score),
    confidence,
    warnings,
    uncertainties
  }
}

// ============================================================================
// TRACE BUILDER
// ============================================================================

/**
 * Build complete decision trace from events
 */
export async function buildDecisionTrace(
  conversationId: string,
  messageId: string
): Promise<DecisionTrace | null> {
  // Get all events for this conversation around the message time
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        include: {
          chatbot: true
        }
      }
    }
  })
  
  if (!message) {
    return null
  }
  
  // Get events for this request (within 5 seconds of message)
  const startTime = new Date(message.createdAt.getTime() - 1000)
  const endTime = new Date(message.createdAt.getTime() + 5000)
  
  const events = await prisma.event.findMany({
    where: {
      conversationId,
      timestamp: {
        gte: startTime,
        lte: endTime
      }
    },
    orderBy: { timestamp: 'asc' }
  })
  
  if (events.length === 0) {
    return null
  }
  
  // Parse events
  const requestStarted = events.find(e => e.eventType === 'orchestrator.request.started')
  const decisionMade = events.find(e => e.eventType === 'orchestrator.decision.made')
  const retrievalEvents = events.filter(e => e.eventType === 'retrieval.source.queried')
  const coherenceChecked = events.find(e => e.eventType === 'validation.coherence.checked')
  const confidenceCalculated = events.find(e => e.eventType === 'validation.confidence.calculated')
  const responseGenerated = events.find(e => e.eventType === 'generation.response.created')
  const requestCompleted = events.find(e => e.eventType === 'orchestrator.request.completed')
  
  const memoryEvents = events.filter(e => 
    e.eventType.startsWith('memory.') && 
    e.timestamp >= message.createdAt
  )
  
  if (!requestStarted || !decisionMade || !requestCompleted) {
    return null
  }
  
  // Parse metadata
  const startMeta = requestStarted.metadata ? JSON.parse(requestStarted.metadata) : {}
  const decisionMeta = decisionMade.metadata ? JSON.parse(decisionMade.metadata) : {}
  const completedMeta = requestCompleted.metadata ? JSON.parse(requestCompleted.metadata) : {}
  const coherenceMeta = coherenceChecked?.metadata ? JSON.parse(coherenceChecked.metadata) : {}
  const confidenceMeta = confidenceCalculated?.metadata ? JSON.parse(confidenceCalculated.metadata) : {}
  const genMeta = responseGenerated?.metadata ? JSON.parse(responseGenerated.metadata) : {}
  
  // Build source usage
  const sourcesUsed: SourceUsage[] = []
  
  // Check each source type
  const persistentUsed = retrievalEvents.find(e => {
    const meta = e.metadata ? JSON.parse(e.metadata) : {}
    return meta.source === 'persistent_memory' || meta.source === 'persistent'
  })
  
  const kbUsed = retrievalEvents.find(e => {
    const meta = e.metadata ? JSON.parse(e.metadata) : {}
    return meta.source === 'knowledge_base' || meta.source === 'kb'
  })
  
  const graphUsed = retrievalEvents.find(e => {
    const meta = e.metadata ? JSON.parse(e.metadata) : {}
    return meta.source === 'knowledge_graph' || meta.source === 'graph'
  })
  
  sourcesUsed.push({
    source: 'persistent_memory',
    used: !!persistentUsed,
    reason: persistentUsed ? undefined : 'No relevant facts for user',
    resultsCount: persistentUsed ? JSON.parse(persistentUsed.metadata || '{}').resultsCount : 0,
    topScore: persistentUsed ? JSON.parse(persistentUsed.metadata || '{}').topScore : undefined
  })
  
  sourcesUsed.push({
    source: 'knowledge_base',
    used: !!kbUsed,
    reason: kbUsed ? undefined : 'Not included in retrieval plan',
    resultsCount: kbUsed ? JSON.parse(kbUsed.metadata || '{}').resultsCount : 0,
    topScore: kbUsed ? JSON.parse(kbUsed.metadata || '{}').topScore : undefined
  })
  
  sourcesUsed.push({
    source: 'knowledge_graph',
    used: !!graphUsed,
    reason: graphUsed ? undefined : 'No graph entities found or not needed',
    resultsCount: graphUsed ? JSON.parse(graphUsed.metadata || '{}').resultsCount : 0,
    topScore: graphUsed ? JSON.parse(graphUsed.metadata || '{}').topScore : undefined
  })
  
  sourcesUsed.push({
    source: 'context',
    used: true, // Always used
    reason: 'Conversation context always included'
  })
  
  // Build trace
  const trace: DecisionTrace = {
    messageId,
    conversationId,
    botId: message.conversation.botId,
    timestamp: message.createdAt,
    query: message.content,
    
    understanding: {
      intent: decisionMeta.intent || 'unknown',
      intentConfidence: 0.85, // Would need to store this
      intentReasoning: 'Based on pattern matching and context',
      queryType: 'factual', // Would need to store this
      queryComplexity: 'moderate',
      entities: decisionMeta.entities || [],
      topics: []
    },
    
    decision: {
      strategy: decisionMeta.strategy || 'unknown',
      why: `Strategy selected based on query characteristics`,
      factors: [],
      alternatives: [],
      confidence: completedMeta.confidence || 0.5,
      warnings: [],
      uncertainties: []
    },
    
    retrieval: {
      sourcesUsed,
      totalResults: retrievalEvents.reduce((sum, e) => {
        const meta = JSON.parse(e.metadata || '{}')
        return sum + (meta.resultsCount || 0)
      }, 0),
      processingTime: retrievalEvents.reduce((sum, e) => sum + (e.durationMs || 0), 0)
    },
    
    validation: coherenceChecked ? {
      coherenceCheck: {
        passed: coherenceMeta.isCoherent !== false,
        score: coherenceMeta.coherenceScore || 0.8,
        conflicts: coherenceMeta.conflicts || 0,
        warnings: coherenceMeta.warnings || []
      },
      confidenceCheck: {
        passed: confidenceMeta.passed !== false,
        score: confidenceMeta.confidence || 0.7,
        threshold: confidenceMeta.threshold || 0.65
      }
    } : undefined,
    
    generation: {
      model: genMeta.model || 'gpt-4o-mini',
      temperature: genMeta.temperature || 0.3,
      tokensUsed: genMeta.tokensUsed,
      processingTime: responseGenerated?.durationMs || 0
    },
    
    learning: {
      factsExtracted: memoryEvents.filter(e => e.eventType === 'memory.fact.extracted').length,
      entitiesCreated: memoryEvents.filter(e => e.eventType === 'memory.entity.created').length,
      relationsCreated: memoryEvents.filter(e => e.eventType === 'memory.relation.created').length
    },
    
    outcome: {
      success: requestCompleted.success,
      overallConfidence: completedMeta.confidence || 0.5,
      responseLength: message.content.length,
      totalProcessingTime: requestCompleted.durationMs || 0
    },
    
    issues: []
  }
  
  // Identify issues
  if (trace.outcome.overallConfidence < 0.5) {
    trace.issues.push({
      severity: 'warning',
      message: 'Low confidence response',
      suggestion: 'Consider improving knowledge base coverage or query understanding'
    })
  }
  
  if (trace.retrieval.totalResults === 0 && decisionMeta.shouldUseRAG) {
    trace.issues.push({
      severity: 'warning',
      message: 'No relevant information found',
      suggestion: 'Query may be outside knowledge base scope'
    })
  }
  
  if (trace.validation && !trace.validation.coherenceCheck.passed) {
    trace.issues.push({
      severity: 'warning',
      message: `Coherence check failed (${trace.validation.coherenceCheck.conflicts} conflicts)`,
      suggestion: 'Review conflicting information in knowledge sources'
    })
  }
  
  if (trace.outcome.totalProcessingTime > 2000) {
    trace.issues.push({
      severity: 'info',
      message: 'Slow response time',
      suggestion: 'Consider optimizing retrieval or caching'
    })
  }
  
  return trace
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format decision trace for human reading (console)
 */
export function formatTraceForConsole(trace: DecisionTrace): string {
  const lines: string[] = []
  
  lines.push('━'.repeat(60))
  lines.push('📝 DECISION TRACE')
  lines.push('━'.repeat(60))
  lines.push('')
  lines.push(`Query: "${trace.query}"`)
  lines.push(`Time: ${trace.timestamp.toISOString()}`)
  lines.push('')
  
  // Understanding
  lines.push('🧠 UNDERSTANDING')
  lines.push(`   Intent: ${trace.understanding.intent} (confidence: ${(trace.understanding.intentConfidence * 100).toFixed(0)}%)`)
  lines.push(`   Query Type: ${trace.understanding.queryType} (${trace.understanding.queryComplexity})`)
  if (trace.understanding.entities.length > 0) {
    lines.push(`   Entities: ${trace.understanding.entities.join(', ')}`)
  }
  lines.push('')
  
  // Decision
  lines.push('🎯 DECISION')
  lines.push(`   Strategy: ${trace.decision.strategy}`)
  lines.push(`   Why: ${trace.decision.why}`)
  lines.push(`   Confidence: ${(trace.decision.confidence * 100).toFixed(0)}%`)
  
  if (trace.decision.alternatives.length > 0) {
    lines.push('')
    lines.push('   Alternatives considered:')
    for (const alt of trace.decision.alternatives.slice(0, 3)) {
      const icon = alt.wouldHaveChosen ? '✓' : '✗'
      const reason = alt.rejected ? ` (${alt.rejected})` : ''
      lines.push(`   ${icon} ${alt.strategy} (score: ${(alt.score * 100).toFixed(0)}%)${reason}`)
    }
  }
  lines.push('')
  
  // Retrieval
  lines.push('🔍 RETRIEVAL')
  for (const source of trace.retrieval.sourcesUsed) {
    const icon = source.used ? '✓' : '✗'
    const details = source.used 
      ? `${source.resultsCount} results${source.topScore ? `, top: ${(source.topScore * 100).toFixed(0)}%` : ''}`
      : source.reason || 'Not used'
    lines.push(`   ${icon} ${source.source}: ${details}`)
  }
  lines.push(`   Total: ${trace.retrieval.totalResults} results in ${trace.retrieval.processingTime}ms`)
  lines.push('')
  
  // Validation
  if (trace.validation) {
    lines.push('✅ VALIDATION')
    const cohIcon = trace.validation.coherenceCheck.passed ? '✓' : '✗'
    lines.push(`   ${cohIcon} Coherence: ${(trace.validation.coherenceCheck.score * 100).toFixed(0)}%`)
    if (trace.validation.coherenceCheck.conflicts > 0) {
      lines.push(`      ⚠️  ${trace.validation.coherenceCheck.conflicts} conflicts detected`)
    }
    const confIcon = trace.validation.confidenceCheck.passed ? '✓' : '✗'
    lines.push(`   ${confIcon} Confidence: ${(trace.validation.confidenceCheck.score * 100).toFixed(0)}% (threshold: ${(trace.validation.confidenceCheck.threshold * 100).toFixed(0)}%)`)
    lines.push('')
  }
  
  // Generation
  lines.push('💬 GENERATION')
  lines.push(`   Model: ${trace.generation.model}`)
  lines.push(`   Temperature: ${trace.generation.temperature}`)
  lines.push(`   Time: ${trace.generation.processingTime}ms`)
  lines.push('')
  
  // Learning
  lines.push('🧠 LEARNING')
  lines.push(`   Facts extracted: ${trace.learning.factsExtracted}`)
  lines.push(`   Entities created: ${trace.learning.entitiesCreated}`)
  lines.push(`   Relations created: ${trace.learning.relationsCreated}`)
  lines.push('')
  
  // Outcome
  lines.push('📊 OUTCOME')
  const successIcon = trace.outcome.success ? '✓' : '✗'
  lines.push(`   ${successIcon} Success`)
  lines.push(`   Overall confidence: ${(trace.outcome.overallConfidence * 100).toFixed(0)}%`)
  lines.push(`   Total time: ${trace.outcome.totalProcessingTime}ms`)
  lines.push('')
  
  // Issues
  if (trace.issues.length > 0) {
    lines.push('⚠️  ISSUES')
    for (const issue of trace.issues) {
      const icon = issue.severity === 'error' ? '🚨' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'
      lines.push(`   ${icon} ${issue.message}`)
      if (issue.suggestion) {
        lines.push(`      💡 ${issue.suggestion}`)
      }
    }
    lines.push('')
  }
  
  lines.push('━'.repeat(60))
  
  return lines.join('\n')
}
