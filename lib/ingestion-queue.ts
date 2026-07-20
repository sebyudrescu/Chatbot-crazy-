/**
 * Async Ingestion Queue System
 * 
 * Separates data ingestion from chat runtime
 * Similar to Chatbase, Stack AI architecture
 * 
 * Benefits:
 * - No timeout issues (jobs run in background)
 * - Retry logic built-in
 * - Progress tracking
 * - Stable KB before chat
 */

import { prisma } from './db'
import { eventStore } from './event-store'
import { withRetry } from './db-retry'
import { assertSafeRemoteUrl, normalizeRemoteUrl } from './url-safety'

export enum JobType {
  CRAWL = 'crawl',
  PDF = 'pdf',
  URL = 'url',
  REINDEX = 'reindex'
}

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface JobParams {
  // For CRAWL
  url?: string
  maxPages?: number
  maxDepth?: number
  
  // For PDF
  fileId?: string
  fileName?: string
  
  // For URL
  singleUrl?: string
  replaceSourceId?: string
  
  // For REINDEX
  sourceIds?: string[]
}

/**
 * Normalize and validate URL
 */
function normalizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required')
  }
  return normalizeRemoteUrl(url).toString()
}

/**
 * Create a new ingestion job (adds to queue)
 */
export async function createIngestionJob(
  botId: string,
  jobType: JobType,
  params: JobParams,
  priority: number = 5,
  options: { dedupeKey?: string } = {},
) {
  // Normalize URLs if present
  if (params.url) {
    try {
      params.url = normalizeUrl(params.url)
      await assertSafeRemoteUrl(params.url)
      console.log(`[IngestionQueue] Normalized URL: ${params.url}`)
    } catch (error) {
      console.error(`[IngestionQueue] Invalid URL: ${(error as Error).message}`)
      throw error
    }
  }
  
  if (params.singleUrl) {
    try {
      params.singleUrl = normalizeUrl(params.singleUrl)
      await assertSafeRemoteUrl(params.singleUrl)
      console.log(`[IngestionQueue] Normalized single URL: ${params.singleUrl}`)
    } catch (error) {
      console.error(`[IngestionQueue] Invalid URL: ${(error as Error).message}`)
      throw error
    }
  }
  
  if (options.dedupeKey) {
    const existing = await prisma.ingestionJob.findUnique({
      where: { dedupeKey: options.dedupeKey },
    })
    if (existing) {
      console.log(`[IngestionQueue] Reusing deduplicated job ${existing.id}`)
      return existing
    }
  }

  let job
  try {
    job = await prisma.ingestionJob.create({
      data: {
        botId,
        jobType,
        dedupeKey: options.dedupeKey,
        status: JobStatus.PENDING,
        priority,
        params: JSON.stringify(params),
        attempts: 0,
        maxAttempts: 5,  // Increased from 3 to 5 for better retry
      }
    })
  } catch (error) {
    if (options.dedupeKey) {
      const existing = await prisma.ingestionJob.findUnique({
        where: { dedupeKey: options.dedupeKey },
      })
      if (existing) return existing
    }
    throw error
  }
  
  console.log(`[IngestionQueue] ✅ Created job ${job.id} (${jobType}) for bot ${botId}`)
  
  // Log event
  await eventStore.logJobCreated(botId, job.id, {
    jobType,
    params,
  })
  
  // Update bot status to indexing
  await prisma.chatbot.update({
    where: { id: botId },
    data: { kbStatus: 'indexing' }
  })
  
  return job
}

/**
 * Get next job to process (FIFO with priority)
 */
export async function getNextJob() {
  const now = new Date()
  
  const job = await prisma.ingestionJob.findFirst({
    where: {
      status: JobStatus.PENDING,
      attempts: { lt: prisma.ingestionJob.fields.maxAttempts },
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: now } }
      ]
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' }
    ]
  })
  
  return job
}

export async function recoverStaleRunningJobs(maxAgeMinutes: number = 20) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
  const [requeued, failed] = await prisma.$transaction([
    prisma.ingestionJob.updateMany({
      where: {
        status: JobStatus.RUNNING,
        startedAt: { lt: cutoff },
        attempts: { lt: prisma.ingestionJob.fields.maxAttempts },
      },
      data: {
        status: JobStatus.PENDING,
        nextRetryAt: new Date(),
        errorMessage: 'Worker interrotto: job recuperato automaticamente',
      },
    }),
    prisma.ingestionJob.updateMany({
      where: {
        status: JobStatus.RUNNING,
        startedAt: { lt: cutoff },
        attempts: { gte: prisma.ingestionJob.fields.maxAttempts },
      },
      data: {
        status: JobStatus.FAILED,
        completedAt: new Date(),
        errorMessage: 'Job interrotto dopo il numero massimo di tentativi',
      },
    }),
  ])
  return { count: requeued.count, failed: failed.count }
}

/**
 * Mark job as started
 */
export async function startJob(jobId: string) {
  const claimed = await withRetry(() =>
    prisma.ingestionJob.updateMany({
      where: { id: jobId, status: JobStatus.PENDING },
      data: {
        status: JobStatus.RUNNING,
        startedAt: new Date(),
        attempts: { increment: 1 }
      }
    })
  )
  if (claimed.count !== 1) {
    throw new Error(`Job ${jobId} is not pending or was claimed by another worker`)
  }
  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error(`Job ${jobId} not found after claim`)
  
  // Log event
  await eventStore.logJobStarted(job.botId, jobId, {
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
  })
  
  return job
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  progress: number,
  message: string
) {
  const job = await withRetry(() =>
    prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        progress,
        progressMessage: message
      }
    })
  )
  
  // Log progress (only at milestones to avoid spam)
  if (progress % 25 === 0 || progress === 100) {
    await eventStore.logJobProgress(job.botId, jobId, {
      progress,
      message,
    })
  }
  
  return job
}

/**
 * Mark job as completed
 */
export async function completeJob(
  jobId: string,
  sourcesCreated: number,
  chunksCreated: number
) {
  const job = await withRetry(() =>
    prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        progress: 100,
        sourcesCreated,
        chunksCreated
      },
      include: { chatbot: true }
    })
  )
  
  console.log(`[IngestionQueue] ✅ Job ${jobId} completed: ${sourcesCreated} sources, ${chunksCreated} chunks`)
  
  const startTime = job.startedAt ? job.startedAt.getTime() : Date.now()
  const durationMs = Date.now() - startTime
  
  // Log event
  await eventStore.logJobCompleted(job.botId, jobId, durationMs, {
    sourcesCreated,
    chunksCreated,
  })
  
  // Refresh usable knowledge immediately. A retrying source must not make
  // already indexed sources unavailable to the chatbot.
  const pendingJobs = await prisma.ingestionJob.count({
    where: {
      botId: job.botId,
      status: { in: [JobStatus.PENDING, JobStatus.RUNNING] }
    }
  })
  
  const totalChunks = await prisma.knowledgeSource.aggregate({
    where: { botId: job.botId, status: 'completed' },
    _sum: { chunkCount: true }
  })
  const availableChunks = totalChunks._sum.chunkCount || 0
  const oldStatus = job.chatbot.kbStatus

  await prisma.chatbot.update({
    where: { id: job.botId },
    data: {
      kbStatus: pendingJobs === 0 ? 'ready' : 'indexing',
      kbLastIndexed: new Date(),
      kbTotalChunks: availableChunks,
      ...(pendingJobs === 0 ? { kbIndexingError: null } : {})
    }
  })

  if (pendingJobs === 0) {
    
    console.log(`[IngestionQueue] 🎉 Bot ${job.botId} KB is now READY with ${totalChunks._sum.chunkCount} chunks`)
    
    // Log KB status change
    await eventStore.logKBStatusChanged(job.botId, {
      from: oldStatus,
      to: 'ready',
      totalChunks: availableChunks,
    })
  }
  
  return job
}

/**
 * Mark job as failed (with retry logic)
 */
export async function failJob(
  jobId: string,
  error: Error
) {
  const job = await withRetry(() =>
    prisma.ingestionJob.findUnique({
      where: { id: jobId }
    })
  )
  
  if (!job) return null
  
  const shouldRetry = job.attempts < job.maxAttempts
  
  if (shouldRetry) {
    // Schedule retry (exponential backoff)
    const retryDelay = Math.pow(2, job.attempts) * 60 * 1000 // 1min, 2min, 4min
    const nextRetryAt = new Date(Date.now() + retryDelay)
    
    await withRetry(() =>
      prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.PENDING,  // Back to pending for retry
          errorMessage: error.message,
          errorStack: error.stack,
          nextRetryAt
        }
      })
    )
    
    console.log(`[IngestionQueue] ⚠️  Job ${jobId} failed, will retry at ${nextRetryAt}`)
    
    // Log job failed event (will retry)
    await eventStore.logJobFailed(job.botId, jobId, error, {
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      nextRetryAt: nextRetryAt.toISOString(),
      permanent: false,
    })
    
  } else {
    // No more retries, mark as permanently failed
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        completedAt: new Date(),
        errorMessage: error.message,
        errorStack: error.stack
      }
    })
    
    const completedKnowledge = await prisma.knowledgeSource.aggregate({
      where: { botId: job.botId, status: 'completed' },
      _sum: { chunkCount: true }
    })
    const availableChunks = completedKnowledge._sum.chunkCount || 0

    // Keep a partially indexed bot usable. The failed source remains visible
    // in diagnostics and can be retried independently.
    await prisma.chatbot.update({
      where: { id: job.botId },
      data: {
        kbStatus: availableChunks > 0 ? 'ready' : 'failed',
        kbTotalChunks: availableChunks,
        kbIndexingError: error.message
      }
    })
    
    console.log(`[IngestionQueue] ❌ Job ${jobId} permanently failed after ${job.attempts} attempts`)
    
    // Log job failed event (permanent)
    await eventStore.logJobFailed(job.botId, jobId, error, {
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      permanent: true,
    })
  }
  
  return job
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string) {
  return await prisma.ingestionJob.findUnique({
    where: { id: jobId },
    include: {
      chatbot: {
        select: {
          companyName: true,
          kbStatus: true,
          kbTotalChunks: true
        }
      }
    }
  })
}

/**
 * Get all jobs for a bot
 */
export async function getBotJobs(botId: string) {
  return await prisma.ingestionJob.findMany({
    where: { botId },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
}

/**
 * Check if bot KB is ready for chat
 */
export async function isBotReady(botId: string): Promise<{
  ready: boolean
  status: string
  message: string
  totalChunks: number
}> {
  const bot = await prisma.chatbot.findUnique({
    where: { id: botId },
    select: {
      kbStatus: true,
      kbTotalChunks: true,
      kbIndexingError: true
    }
  })
  
  if (!bot) {
    return {
      ready: false,
      status: 'not_found',
      message: 'Bot not found',
      totalChunks: 0
    }
  }
  
  switch (bot.kbStatus) {
    case 'ready':
      return {
        ready: true,
        status: 'ready',
        message: `Knowledge base ready with ${bot.kbTotalChunks} chunks`,
        totalChunks: bot.kbTotalChunks
      }
      
    case 'indexing':
      if (bot.kbTotalChunks > 0) {
        return {
          ready: true,
          status: 'ready',
          message: `Knowledge base ready with ${bot.kbTotalChunks} chunks; altre fonti sono in aggiornamento`,
          totalChunks: bot.kbTotalChunks
        }
      }
      return {
        ready: false,
        status: 'indexing',
        message: 'Knowledge base is still being indexed. Please wait...',
        totalChunks: bot.kbTotalChunks
      }
      
    case 'failed':
      return {
        ready: false,
        status: 'failed',
        message: `Indexing failed: ${bot.kbIndexingError || 'Unknown error'}`,
        totalChunks: bot.kbTotalChunks
      }
      
    case 'empty':
    default:
      return {
        ready: false,
        status: 'empty',
        message: 'No knowledge base indexed yet. Please add sources.',
        totalChunks: 0
      }
  }
}

/**
 * Cancel all pending jobs for a bot (useful before reindex)
 */
export async function cancelBotJobs(botId: string) {
  const result = await prisma.ingestionJob.updateMany({
    where: {
      botId,
      status: { in: [JobStatus.PENDING, JobStatus.RUNNING] }
    },
    data: {
      status: JobStatus.FAILED,
      errorMessage: 'Cancelled by user',
      completedAt: new Date()
    }
  })
  
  console.log(`[IngestionQueue] 🛑 Cancelled ${result.count} jobs for bot ${botId}`)
  
  return result
}
