/**
 * EVENT STORE MANAGER
 * 
 * Append-only event logging system for:
 * - Debugging and troubleshooting
 * - Audit trail and compliance
 * - System behavior analysis
 * - Performance monitoring
 * 
 * Design principles:
 * - Non-blocking: Fire-and-forget for info events
 * - Structured + flexible: Common fields + JSON metadata
 * - Query-optimized: Indexes on all common query patterns
 * - Time-bounded: Automatic retention policies
 * 
 * @module event-store
 */

import 'server-only'
import { prisma } from './db'

// ============================================================================
// TYPES & ENUMS
// ============================================================================

export enum EventCategory {
  SYSTEM = 'system',
  INGESTION = 'ingestion',
  ORCHESTRATOR = 'orchestrator',
  RETRIEVAL = 'retrieval',
  MEMORY = 'memory',
  VALIDATION = 'validation',
  GENERATION = 'generation',
  CONVERSATION = 'conversation',
}

export enum EventSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface EventContext {
  botId?: string
  conversationId?: string
  userId?: string
  jobId?: string
}

export interface EventData {
  eventType: string
  category: EventCategory
  severity?: EventSeverity
  success?: boolean
  durationMs?: number
  errorMessage?: string
  errorStack?: string
  metadata?: Record<string, any>
  durable?: boolean
}

// ============================================================================
// EVENT STORE CLASS
// ============================================================================

class EventStoreManager {
  /**
   * Log an event (async, non-blocking)
   */
  async log(
    context: EventContext,
    data: EventData
  ): Promise<void> {
    try {
      // Async fire-and-forget for most events
      // Only critical events should use await
      const shouldWait = data.durable || data.severity === EventSeverity.CRITICAL ||
                        data.severity === EventSeverity.ERROR

      const eventPromise = prisma.event.create({
        data: {
          ...context,
          eventType: data.eventType,
          category: data.category,
          severity: data.severity || EventSeverity.INFO,
          success: data.success ?? true,
          durationMs: data.durationMs,
          errorMessage: data.errorMessage,
          errorStack: data.errorStack,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        },
      })

      if (shouldWait) {
        await eventPromise
      } else {
        // Fire and forget - don't wait
        eventPromise.catch(error => {
          console.error('[EventStore] Failed to log event:', error.message)
        })
      }
    } catch (error: any) {
      // Never throw - event logging should never break the app
      console.error('[EventStore] Error logging event:', error.message)
    }
  }

  /**
   * Log critical event (always waits for confirmation)
   */
  async logCritical(
    context: EventContext,
    data: Omit<EventData, 'severity'>
  ): Promise<void> {
    return this.log(context, {
      ...data,
      severity: EventSeverity.CRITICAL,
    })
  }

  /**
   * Log error event
   */
  async logError(
    context: EventContext,
    error: Error,
    data: Omit<EventData, 'severity' | 'success' | 'errorMessage' | 'errorStack'>
  ): Promise<void> {
    return this.log(context, {
      ...data,
      severity: EventSeverity.ERROR,
      success: false,
      errorMessage: error.message,
      errorStack: error.stack,
    })
  }

  // ========================================================================
  // SYSTEM EVENTS
  // ========================================================================

  async logSystemStartup(metadata?: Record<string, any>): Promise<void> {
    return this.log({}, {
      eventType: 'system.startup',
      category: EventCategory.SYSTEM,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logSystemShutdown(metadata?: Record<string, any>): Promise<void> {
    return this.log({}, {
      eventType: 'system.shutdown',
      category: EventCategory.SYSTEM,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logWorkerStarted(metadata?: Record<string, any>): Promise<void> {
    return this.log({}, {
      eventType: 'system.worker.started',
      category: EventCategory.SYSTEM,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  // ========================================================================
  // INGESTION EVENTS
  // ========================================================================

  async logJobCreated(
    botId: string,
    jobId: string,
    metadata: { jobType: string; params: any }
  ): Promise<void> {
    return this.log({ botId, jobId }, {
      eventType: 'ingestion.job.created',
      category: EventCategory.INGESTION,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logJobStarted(
    botId: string,
    jobId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    return this.log({ botId, jobId }, {
      eventType: 'ingestion.job.started',
      category: EventCategory.INGESTION,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logJobProgress(
    botId: string,
    jobId: string,
    metadata: { progress: number; message: string }
  ): Promise<void> {
    return this.log({ botId, jobId }, {
      eventType: 'ingestion.job.progress',
      category: EventCategory.INGESTION,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logJobCompleted(
    botId: string,
    jobId: string,
    durationMs: number,
    metadata: { sourcesCreated: number; chunksCreated: number }
  ): Promise<void> {
    return this.log({ botId, jobId }, {
      eventType: 'ingestion.job.completed',
      category: EventCategory.INGESTION,
      severity: EventSeverity.INFO,
      success: true,
      durationMs,
      metadata,
    })
  }

  async logJobFailed(
    botId: string,
    jobId: string,
    error: Error,
    metadata?: Record<string, any>
  ): Promise<void> {
    return this.logError({ botId, jobId }, error, {
      eventType: 'ingestion.job.failed',
      category: EventCategory.INGESTION,
      metadata,
    })
  }

  async logKBStatusChanged(
    botId: string,
    metadata: { from: string; to: string; totalChunks: number }
  ): Promise<void> {
    return this.log({ botId }, {
      eventType: 'ingestion.kb.status_changed',
      category: EventCategory.INGESTION,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  // ========================================================================
  // ORCHESTRATOR EVENTS
  // ========================================================================

  async logRequestStarted(
    botId: string,
    conversationId: string,
    metadata: { query: string; userId?: string }
  ): Promise<void> {
    return this.log({ botId, conversationId, userId: metadata.userId }, {
      eventType: 'orchestrator.request.started',
      category: EventCategory.ORCHESTRATOR,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logPhaseCompleted(
    botId: string,
    conversationId: string,
    metadata: {
      phase: string
      durationMs: number
      [key: string]: any
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'orchestrator.phase.completed',
      category: EventCategory.ORCHESTRATOR,
      severity: EventSeverity.INFO,
      durationMs: metadata.durationMs,
      metadata,
    })
  }

  async logDecisionMade(
    botId: string,
    conversationId: string,
    metadata: {
      intent: string
      strategy: string
      sources: string[]
      shouldUseRAG: boolean
      shouldUseGraph: boolean
      entities: string[]
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'orchestrator.decision.made',
      category: EventCategory.ORCHESTRATOR,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logRequestCompleted(
    botId: string,
    conversationId: string,
    durationMs: number,
    metadata: {
      strategy: string
      factsLearned: number
      confidence: number
      groundingAction?: 'allow' | 'caution' | 'fallback'
      groundingReason?: string
      groundingEvidenceCount?: number
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'orchestrator.request.completed',
      category: EventCategory.ORCHESTRATOR,
      severity: EventSeverity.INFO,
      success: true,
      durationMs,
      metadata,
    })
  }

  async logRequestFailed(
    botId: string,
    conversationId: string,
    error: Error,
    metadata?: Record<string, any>
  ): Promise<void> {
    return this.logError({ botId, conversationId }, error, {
      eventType: 'orchestrator.request.failed',
      category: EventCategory.ORCHESTRATOR,
      metadata,
    })
  }

  // ========================================================================
  // RETRIEVAL EVENTS
  // ========================================================================

  async logRetrievalStarted(
    botId: string,
    conversationId: string,
    metadata: {
      query: string
      sources: string[]
      intent: string
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'retrieval.started',
      category: EventCategory.RETRIEVAL,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logSourceQueried(
    botId: string,
    conversationId: string,
    metadata: {
      source: string
      resultsCount: number
      topScore?: number
      durationMs: number
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'retrieval.source.queried',
      category: EventCategory.RETRIEVAL,
      severity: EventSeverity.INFO,
      durationMs: metadata.durationMs,
      metadata,
    })
  }

  async logRetrievalCompleted(
    botId: string,
    conversationId: string,
    durationMs: number,
    metadata: {
      totalResults: number
      sourcesUsed: string[]
      topScore: number
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'retrieval.completed',
      category: EventCategory.RETRIEVAL,
      severity: EventSeverity.INFO,
      success: true,
      durationMs,
      metadata,
    })
  }

  // ========================================================================
  // MEMORY EVENTS
  // ========================================================================

  async logFactExtracted(
    botId: string,
    conversationId: string,
    metadata: {
      factType: string
      entityName?: string
      confidence: number
      source: string
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'memory.fact.extracted',
      category: EventCategory.MEMORY,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logFactUpdated(
    botId: string,
    metadata: {
      factId: string
      changes: string[]
      reason: string
    }
  ): Promise<void> {
    return this.log({ botId }, {
      eventType: 'memory.fact.updated',
      category: EventCategory.MEMORY,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logFactSuperseded(
    botId: string,
    metadata: {
      oldFactId: string
      newFactId: string
      reason: string
    }
  ): Promise<void> {
    return this.log({ botId }, {
      eventType: 'memory.fact.superseded',
      category: EventCategory.MEMORY,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logEntityCreated(
    botId: string,
    metadata: {
      entityId: string
      entityType: string
      entityName: string
      confidence: number
      extractedFrom: string
    }
  ): Promise<void> {
    return this.log({ botId }, {
      eventType: 'memory.entity.created',
      category: EventCategory.MEMORY,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logRelationCreated(
    botId: string,
    metadata: {
      relationId: string
      relationType: string
      sourceEntity: string
      targetEntity: string
      confidence: number
    }
  ): Promise<void> {
    return this.log({ botId }, {
      eventType: 'memory.relation.created',
      category: EventCategory.MEMORY,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  // ========================================================================
  // VALIDATION EVENTS
  // ========================================================================

  async logCoherenceChecked(
    botId: string,
    conversationId: string,
    metadata: {
      isCoherent: boolean
      coherenceScore: number
      conflicts: number
      warnings: string[]
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'validation.coherence.checked',
      category: EventCategory.VALIDATION,
      severity: metadata.isCoherent ? EventSeverity.INFO : EventSeverity.WARNING,
      success: metadata.isCoherent,
      metadata,
    })
  }

  async logConfidenceCalculated(
    botId: string,
    conversationId: string,
    metadata: {
      confidence: number
      factors: Record<string, number>
      threshold: number
      passed: boolean
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'validation.confidence.calculated',
      category: EventCategory.VALIDATION,
      severity: metadata.passed ? EventSeverity.INFO : EventSeverity.WARNING,
      metadata,
    })
  }

  // ========================================================================
  // GENERATION EVENTS
  // ========================================================================

  async logResponseGenerated(
    botId: string,
    conversationId: string,
    durationMs: number,
    metadata: {
      strategy: string
      tokensUsed?: number
      model: string
      temperature: number
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'generation.response.created',
      category: EventCategory.GENERATION,
      severity: EventSeverity.INFO,
      success: true,
      durationMs,
      metadata,
    })
  }

  async logLLMCalled(
    botId: string,
    conversationId: string,
    durationMs: number,
    metadata: {
      model: string
      promptTokens?: number
      completionTokens?: number
      temperature: number
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'generation.llm.called',
      category: EventCategory.GENERATION,
      severity: EventSeverity.INFO,
      durationMs,
      metadata,
    })
  }

  // ========================================================================
  // CONVERSATION EVENTS
  // ========================================================================

  async logMessageReceived(
    botId: string,
    conversationId: string,
    userId: string,
    metadata: {
      messageLength: number
      intent?: string
    }
  ): Promise<void> {
    return this.log({ botId, conversationId, userId }, {
      eventType: 'conversation.message.received',
      category: EventCategory.CONVERSATION,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logMessageSent(
    botId: string,
    conversationId: string,
    metadata: {
      messageLength: number
      sourcesUsed: number
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'conversation.message.sent',
      category: EventCategory.CONVERSATION,
      severity: EventSeverity.INFO,
      metadata,
    })
  }

  async logConversationStarted(
    botId: string,
    conversationId: string,
    userId: string
  ): Promise<void> {
    return this.log({ botId, conversationId, userId }, {
      eventType: 'conversation.started',
      category: EventCategory.CONVERSATION,
      severity: EventSeverity.INFO,
    })
  }

  async logConversationEnded(
    botId: string,
    conversationId: string,
    metadata: {
      messageCount: number
      duration: number
      resolved: boolean
    }
  ): Promise<void> {
    return this.log({ botId, conversationId }, {
      eventType: 'conversation.ended',
      category: EventCategory.CONVERSATION,
      severity: EventSeverity.INFO,
      metadata,
    })
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const eventStore = new EventStoreManager()

// ============================================================================
// QUERY UTILITIES
// ============================================================================

/**
 * Get events for a bot (with filters)
 */
export async function getEvents(options: {
  botId?: string
  conversationId?: string
  jobId?: string
  category?: EventCategory
  severity?: EventSeverity
  eventType?: string
  success?: boolean
  startDate?: Date
  endDate?: Date
  limit?: number
}) {
  const {
    botId,
    conversationId,
    jobId,
    category,
    severity,
    eventType,
    success,
    startDate,
    endDate,
    limit = 100,
  } = options

  const where: any = {}
  
  if (botId) where.botId = botId
  if (conversationId) where.conversationId = conversationId
  if (jobId) where.jobId = jobId
  if (category) where.category = category
  if (severity) where.severity = severity
  if (eventType) where.eventType = eventType
  if (success !== undefined) where.success = success
  
  if (startDate || endDate) {
    where.timestamp = {}
    if (startDate) where.timestamp.gte = startDate
    if (endDate) where.timestamp.lte = endDate
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  })

  return events.map(e => ({
    ...e,
    metadata: e.metadata ? JSON.parse(e.metadata) : null,
  }))
}

/**
 * Get event timeline for conversation
 */
export async function getConversationTimeline(conversationId: string) {
  return getEvents({
    conversationId,
    limit: 500,
  })
}

/**
 * Get job execution trace
 */
export async function getJobTrace(jobId: string) {
  return getEvents({
    jobId,
    limit: 500,
  })
}

/**
 * Get error events (for debugging)
 */
export async function getErrorEvents(options: {
  botId?: string
  startDate?: Date
  endDate?: Date
  limit?: number
}) {
  return getEvents({
    ...options,
    severity: EventSeverity.ERROR,
  })
}

/**
 * Get event statistics
 */
export async function getEventStats(options: {
  botId?: string
  startDate?: Date
  endDate?: Date
}) {
  const { botId, startDate, endDate } = options

  const where: any = {}
  if (botId) where.botId = botId
  if (startDate || endDate) {
    where.timestamp = {}
    if (startDate) where.timestamp.gte = startDate
    if (endDate) where.timestamp.lte = endDate
  }

  const [
    totalEvents,
    errorEvents,
    categoryStats,
    severityStats,
  ] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.count({ where: { ...where, success: false } }),
    prisma.event.groupBy({
      by: ['category'],
      where,
      _count: true,
    }),
    prisma.event.groupBy({
      by: ['severity'],
      where,
      _count: true,
    }),
  ])

  return {
    totalEvents,
    errorEvents,
    successRate: totalEvents > 0 ? ((totalEvents - errorEvents) / totalEvents) * 100 : 0,
    byCategory: categoryStats.reduce((acc, stat) => {
      acc[stat.category] = stat._count
      return acc
    }, {} as Record<string, number>),
    bySeverity: severityStats.reduce((acc, stat) => {
      acc[stat.severity] = stat._count
      return acc
    }, {} as Record<string, number>),
  }
}

/**
 * Cleanup old events (retention policy)
 */
export async function cleanupOldEvents(options: {
  keepDays: number
  keepErrorsDays?: number
  keepMilestonePermanent?: boolean
}) {
  const { keepDays, keepErrorsDays = 365, keepMilestonePermanent = true } = options

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - keepDays)

  const errorCutoffDate = new Date()
  errorCutoffDate.setDate(errorCutoffDate.getDate() - keepErrorsDays)

  // Milestone events to keep permanently
  const milestoneEventTypes = [
    'ingestion.job.completed',
    'ingestion.kb.status_changed',
    'conversation.started',
    'conversation.ended',
  ]

  // Delete old info events
  const infoDeleted = await prisma.event.deleteMany({
    where: {
      timestamp: { lt: cutoffDate },
      severity: EventSeverity.INFO,
      eventType: keepMilestonePermanent ? { notIn: milestoneEventTypes } : undefined,
    },
  })

  // Delete old error events (keep longer)
  const errorDeleted = await prisma.event.deleteMany({
    where: {
      timestamp: { lt: errorCutoffDate },
      severity: { in: [EventSeverity.ERROR, EventSeverity.CRITICAL] },
    },
  })

  console.log(`[EventStore] Cleanup: deleted ${infoDeleted.count} info events, ${errorDeleted.count} error events`)

  return {
    infoDeleted: infoDeleted.count,
    errorDeleted: errorDeleted.count,
  }
}
