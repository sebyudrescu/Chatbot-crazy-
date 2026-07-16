/**
 * POST /api/ingestion/crawl
 * 
 * Async crawl endpoint - creates job in queue
 * Returns immediately with job ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { createIngestionJob, JobType } from '@/lib/ingestion-queue'
import { ensureWorkerStarted } from '@/lib/auto-start-worker'

export async function POST(request: NextRequest) {
  try {
    // Start lazily only for a real ingestion request, never while Next.js builds.
    await ensureWorkerStarted()

    const body = await request.json()
    const { botId, url, maxPages = 50, maxDepth = 4, priority = 5 } = body

    if (!botId || !url) {
      return NextResponse.json(
        { success: false, error: 'Missing botId or url' },
        { status: 400 }
      )
    }

    // Create job (doesn't process yet!)
    const job = await createIngestionJob(
      botId,
      JobType.CRAWL,
      { url, maxPages, maxDepth },
      priority
    )

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        message: 'Crawl job queued. Processing will start shortly.',
        estimatedTime: '2-5 minutes'
      }
    })

  } catch (error: any) {
    console.error('[API] Crawl error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
