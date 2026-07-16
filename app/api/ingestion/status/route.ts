/**
 * GET /api/ingestion/status?jobId=xxx
 * 
 * Check status of an ingestion job
 */

import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus, getBotJobs } from '@/lib/ingestion-queue'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const jobId = searchParams.get('jobId')
    const botId = searchParams.get('botId')

    if (jobId) {
      // Get specific job status
      const job = await getJobStatus(jobId)

      if (!job) {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          id: job.id,
          type: job.jobType,
          status: job.status,
          progress: job.progress,
          progressMessage: job.progressMessage,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          sourcesCreated: job.sourcesCreated,
          chunksCreated: job.chunksCreated,
          error: job.errorMessage,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          bot: job.chatbot
        }
      })

    } else if (botId) {
      // Get all jobs for bot
      const jobs = await getBotJobs(botId)

      return NextResponse.json({
        success: true,
        data: jobs.map(job => ({
          id: job.id,
          type: job.jobType,
          status: job.status,
          progress: job.progress,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          sourcesCreated: job.sourcesCreated,
          chunksCreated: job.chunksCreated,
        }))
      })

    } else {
      return NextResponse.json(
        { success: false, error: 'Missing jobId or botId parameter' },
        { status: 400 }
      )
    }

  } catch (error: any) {
    console.error('[API] Status check error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
