/**
 * DECISION TRACE API
 * 
 * GET /api/decisions/[messageId]/trace
 * 
 * Ritorna la trace completa di una decisione per debugging e analisi
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildDecisionTrace } from '@/lib/decision-tracer'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest, props: { params: Promise<{ messageId: string }> }) {
  const params = await props.params;
  try {
    const { messageId } = params

    // Get message to find conversation
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true }
    })

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    // Build trace
    const trace = await buildDecisionTrace(message.conversationId, messageId)

    if (!trace) {
      return NextResponse.json(
        { error: 'No trace data available for this message' },
        { status: 404 }
      )
    }

    return NextResponse.json(trace)
  } catch (error: any) {
    console.error('[DecisionTrace] Error:', error)
    return NextResponse.json(
      { error: 'Failed to build decision trace', details: error.message },
      { status: 500 }
    )
  }
}
