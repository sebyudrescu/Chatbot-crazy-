/**
 * CONVERSATION TRACE API
 * 
 * GET /api/conversations/[id]/trace
 * 
 * Ritorna le trace di tutte le decisioni in una conversazione
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildDecisionTrace } from '@/lib/decision-tracer'
import { prisma } from '@/lib/db'
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from '@/lib/workspace-auth'

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id: conversationId } = params
    const actor = await requireDashboardActor(request)
    await requireResourcePermission(actor, 'conversation', conversationId, 'conversation.read')

    // Get all assistant messages in conversation
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        role: 'assistant'
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    })

    if (messages.length === 0) {
      return NextResponse.json({
        conversationId,
        traces: []
      })
    }

    // Build traces for all messages
    const traces = await Promise.all(
      messages.map(msg => buildDecisionTrace(conversationId, msg.id))
    )

    // Filter out nulls
    const validTraces = traces.filter(t => t !== null)

    return NextResponse.json({
      conversationId,
      messageCount: messages.length,
      traceCount: validTraces.length,
      traces: validTraces
    })
  } catch (error: any) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error('[ConversationTrace] Error:', error)
    return NextResponse.json(
      { error: 'Failed to build conversation traces', details: error.message },
      { status: 500 }
    )
  }
}
