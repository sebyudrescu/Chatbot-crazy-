/**
 * POST /api/ingestion/add-url
 * 
 * Async single URL - creates job in queue
 * Returns immediately with job ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { createIngestionJob, JobType } from '@/lib/ingestion-queue'
import { enqueueIngestionWorkflow } from '@/lib/enqueue-ingestion-workflow'
import { assertSafeRemoteUrl } from '@/lib/url-safety'
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request)
    const body = await request.json()
    const { botId, url, priority = 5 } = body

    if (!botId || !url) {
      return NextResponse.json(
        { success: false, error: 'Missing botId or url' },
        { status: 400 }
      )
    }
    await requireBotPermission(actor, botId, 'chatbot.write')

    // Validate URL
    try {
      await assertSafeRemoteUrl(url)
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
    const workflow = await enqueueIngestionWorkflow(job.id)

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        workflowRunId: workflow.runId,
        url,
        status: job.status,
        message: 'URL added to queue. Processing will start shortly.',
        estimatedTime: '10-30 seconds'
      }
    })

  } catch (error: any) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error('[API] Add URL error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
