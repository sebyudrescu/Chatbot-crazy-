/**
 * POST /api/ingestion/cancel
 * 
 * Cancel all pending/running jobs for a bot
 * Useful for cleaning up stuck jobs
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { botId } = body

    if (!botId) {
      return NextResponse.json(
        { success: false, error: 'Missing botId' },
        { status: 400 }
      )
    }

    console.log(`[Cancel] Cancelling all jobs for bot ${botId}`)

    // Cancel all pending/running jobs
    const result = await prisma.ingestionJob.updateMany({
      where: {
        botId,
        status: { in: ['pending', 'running'] }
      },
      data: {
        status: 'failed',
        errorMessage: 'Cancelled by user',
        completedAt: new Date()
      }
    })

    // Reset bot KB status
    await prisma.chatbot.update({
      where: { id: botId },
      data: {
        kbStatus: 'empty',
        kbIndexingError: 'Jobs cancelled by user'
      }
    })

    console.log(`[Cancel] Cancelled ${result.count} jobs`)

    return NextResponse.json({
      success: true,
      data: {
        cancelledCount: result.count,
        message: `Cancelled ${result.count} jobs`
      }
    })

  } catch (error: any) {
    console.error('[Cancel] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
