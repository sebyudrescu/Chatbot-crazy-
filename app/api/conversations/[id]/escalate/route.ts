import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/conversations/[id]/escalate
 * Escalate conversation to human agent
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { reason, assignedAgent } = await request.json()
    const conversationId = params.id

    // Update conversation with escalation
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        needsHumanEscalation: true,
        escalatedAt: new Date(),
        escalationReason: reason || 'User requested human assistance',
        assignedAgent: assignedAgent || null,
      },
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

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        needsHumanEscalation: false,
        escalationReason: null,
        escalatedAt: null,
      },
    })

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
