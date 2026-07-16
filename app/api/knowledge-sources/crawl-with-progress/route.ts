import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createIngestionJob, JobType } from '@/lib/ingestion-queue'
import { ensureWorkerStarted } from '@/lib/auto-start-worker'

/**
 * POST /api/knowledge-sources/crawl-with-progress
 * 
 * ASYNC API - Uses background worker for reliable processing
 * Returns job ID immediately, client polls for status
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { botId, url, maxPages = 10, maxDepth = 3 } = body

  console.log(`[CrawlAPI] Received request: botId=${botId}, url=${url}`)

  // Validation
  if (!botId || !url) {
    return NextResponse.json(
      { success: false, error: 'botId and url are required' },
      { status: 400 }
    )
  }

  // Verify chatbot exists
  const chatbot = await prisma.chatbot.findUnique({
    where: { id: botId }
  })

  if (!chatbot) {
    return NextResponse.json(
      { success: false, error: 'Chatbot not found' },
      { status: 404 }
    )
  }
  
  try {
    // Ensure worker is running
    await ensureWorkerStarted()
    
    // Create async job
    const job = await createIngestionJob(
      botId,
      JobType.CRAWL,
      { url, maxPages, maxDepth },
      5 // priority
    )
    
    console.log(`[CrawlAPI] Created job ${job.id}`)
    
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Crawl job created. Poll /api/ingestion/status/{botId} for progress.'
    })
    
  } catch (error: any) {
    console.error('[CrawlAPI] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
