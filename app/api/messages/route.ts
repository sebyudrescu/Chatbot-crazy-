import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CreateMessageSchema } from '@/lib/types'
import { stringifyJSON, parseJSON } from '@/lib/utils'

// POST /api/messages - Create a message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = CreateMessageSchema.parse(body)
    
    const message = await prisma.message.create({
      data: {
        conversationId: validatedData.conversationId,
        role: validatedData.role,
        content: validatedData.content,
        sourcesUsed: validatedData.sourcesUsed
          ? stringifyJSON(validatedData.sourcesUsed)
          : null,
      },
    })
    
    // Update conversation lastMessageAt
    await prisma.conversation.update({
      where: { id: validatedData.conversationId },
      data: { lastMessageAt: new Date() },
    })
    
    return NextResponse.json(
      {
        success: true,
        data: {
          ...message,
          sourcesUsed: parseJSON(message.sourcesUsed),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating message:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create message',
      },
      { status: 400 }
    )
  }
}
