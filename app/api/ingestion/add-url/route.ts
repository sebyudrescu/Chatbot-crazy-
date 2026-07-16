/**
 * POST /api/ingestion/add-url
 * 
 * Async single URL - creates job in queue
 * Returns immediately with job ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { createIngestionJob, JobType } from '@/lib/ingestion-queue'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { botId, url, priority = 5 } = body

    if (!botId || !url) {
      return NextResponse.json(
        { success: false, error: 'Missing botId or url' },
        { status: 400 }
      )
    }

    // Validate URL
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Create job
    const job = await createIngestionJob(
      botId,
      JobType.URL,
      { singleUrl: url },
      priority
    )

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        url,
        status: job.status,
        message: 'URL added to queue. Processing will start shortly.',
        estimatedTime: '10-30 seconds'
      }
    })

  } catch (error: any) {
    console.error('[API] Add URL error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
