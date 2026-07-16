/**
 * DASHBOARD TRACES API
 * 
 * GET /api/dashboard/traces?botId=<id>&limit=<n>
 * 
 * Ritorna le trace recenti per la dashboard
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildDecisionTrace } from '@/lib/decision-tracer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const botId = searchParams.get('botId')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!botId) {
      return NextResponse.json(
        { error: 'botId is required' },
        { status: 400 }
      )
    }

    // Get recent assistant messages
    const messages = await prisma.message.findMany({
      where: {
        role: 'assistant',
        conversation: {
          botId
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        conversation: {
          select: {
            id: true,
            userSessionId: true,
            startedAt: true
          }
        }
      }
    })

    // Build traces (with timeout to avoid hanging)
    const tracesPromises = messages.map(async (msg) => {
      try {
        const trace = await Promise.race([
          buildDecisionTrace(msg.conversation.id, msg.id),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 2000)
          )
        ])
        return trace
      } catch (error) {
        return null
      }
    })

    const traces = await Promise.all(tracesPromises)
    const validTraces = traces.filter(t => t !== null)

    // Calculate summary stats
    const summary = {
      totalMessages: messages.length,
      tracesAvailable: validTraces.length,
      avgConfidence: validTraces.length > 0
        ? validTraces.reduce((sum: number, t) => {
            const confidence = (t as any)?.outcome?.overallConfidence || 0;
            return sum + Number(confidence);
          }, 0) / validTraces.length
        : 0,
      avgResponseTime: validTraces.length > 0
        ? validTraces.reduce((sum: number, t) => {
            const time = (t as any)?.outcome?.totalProcessingTime || 0;
            return sum + Number(time);
          }, 0) / validTraces.length
        : 0,
      strategies: {} as Record<string, number>,
      issueCount: validTraces.reduce((sum, t) => sum + ((t as any)?.issues?.length || 0), 0)
    }

    // Count strategies
    for (const trace of validTraces) {
      if (trace) {
        const strategy = (trace as any)?.decision?.strategy || 'unknown'
        summary.strategies[strategy] = (summary.strategies[strategy] || 0) + 1
      }
    }

    return NextResponse.json({
      summary,
      traces: validTraces.slice(0, limit)
    })
  } catch (error: any) {
    console.error('[DashboardTraces] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch traces', details: error.message },
      { status: 500 }
    )
  }
}
