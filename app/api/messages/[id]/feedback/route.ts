import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/messages/[id]/feedback
 * Add feedback (thumbs up/down) to a message
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { feedback, feedbackComment } = await request.json()
    const messageId = params.id

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
    console.error('Error adding feedback:', error)
    return NextResponse.json(
      { error: 'Failed to add feedback' },
      { status: 500 }
    )
  }
}
