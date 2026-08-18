import { after, NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { emitIntegrationWebhook } from '@/lib/integration-webhooks'
import { escalateHelpDeskConversation, returnHelpDeskConversationToBot } from '@/lib/helpdesk-operations'

/**
 * POST /api/conversations/[id]/escalate
 * Escalate conversation to human agent
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { reason, assignedAgent } = await request.json()
    const conversationId = params.id

    const current = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { botId: true } })
    if (!current) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const result = await escalateHelpDeskConversation({
      botId: current.botId,
      conversationId,
      reason: typeof reason === 'string' ? reason : null,
      assignedAgent: typeof assignedAgent === 'string' ? assignedAgent : null,
    })
    const updatedConversation = result?.conversation
    if (!updatedConversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    if (result.transitioned) after(async () => {
      await emitIntegrationWebhook({
        botId: updatedConversation.botId,
        event: 'conversation.handoff_requested',
        idempotencyKey: `escalation:${updatedConversation.id}:${updatedConversation.handoffSequence}`,
        payload: {
          conversationId: updatedConversation.id,
          reason: updatedConversation.escalationReason,
          assignedAgent: updatedConversation.assignedAgent,
        },
      })
    })

    return NextResponse.json({
      success: true,
      conversation: updatedConversation,
      message: 'Conversation escalated successfully. A human agent will assist you shortly.',
    })
  } catch (error) {
    console.error('Error escalating conversation:', error)
    return NextResponse.json(
      { error: 'Failed to escalate conversation' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/conversations/[id]/escalate
 * Remove escalation status (agent resolves and returns to bot)
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const conversationId = params.id

    const current = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { botId: true } })
    if (!current) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const result = await returnHelpDeskConversationToBot({ botId: current.botId, conversationId })
    const updatedConversation = result?.conversation

    return NextResponse.json({
      success: true,
      conversation: updatedConversation,
    })
  } catch (error) {
    console.error('Error removing escalation:', error)
    return NextResponse.json(
      { error: 'Failed to remove escalation' },
      { status: 500 }
    )
  }
}
