import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from '@/lib/workspace-auth'

/**
 * POST /api/messages/[id]/feedback
 * Add feedback (thumbs up/down) to a message
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { feedback, feedbackComment } = await request.json()
    const messageId = params.id
    const actor = await requireDashboardActor(request)
    await requireResourcePermission(actor, 'message', messageId, 'conversation.write')

    if (!feedback || !['positive', 'negative'].includes(feedback)) {
      return NextResponse.json(
        { error: 'Invalid feedback. Must be "positive" or "negative"' },
        { status: 400 }
      )
    }

    // Update message with feedback
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        feedback,
        feedbackComment: feedbackComment || null,
      },
    })

    return NextResponse.json({
      success: true,
      message: updatedMessage,
    })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Error adding feedback:', error)
    return NextResponse.json(
      { error: 'Failed to add feedback' },
      { status: 500 }
    )
  }
}
