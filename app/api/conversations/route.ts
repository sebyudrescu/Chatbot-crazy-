import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CreateConversationSchema } from '@/lib/types'
import { isAllowedWidgetOrigin } from '@/lib/widget-origin'
import { parseJSON } from '@/lib/utils'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

// GET /api/conversations - List conversations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const botId = searchParams.get('botId')
    const userSessionId = searchParams.get('userSessionId')
    
    const conversations = await prisma.conversation.findMany({
      where: {
        ...(botId && { botId }),
        ...(userSessionId && { userSessionId }),
      },
      include: {
        chatbot: {
          select: { id: true, companyName: true },
        },
        _count: {
          select: { messages: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { startedAt: 'desc' },
    })
    
    return NextResponse.json({
      success: true,
      data: conversations.map(conversation => ({
        ...conversation,
        tags: parseJSON<string[]>(conversation.tags) || [],
      })),
    })
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch conversations' },
      { status: 500 }
    )
  }
}

// POST /api/conversations - Create a conversation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = CreateConversationSchema.parse(body)
    if (!await isAllowedWidgetOrigin(validatedData.botId, request.headers.get('origin'), request.nextUrl.origin)) {
      return NextResponse.json({ success: false, error: 'origin_not_allowed' }, { status: 403 })
    }
    
    const conversation = await prisma.conversation.create({
      data: {
        botId: validatedData.botId,
        userSessionId: validatedData.userSessionId,
      },
    })
    
    return NextResponse.json(
      {
        success: true,
        data: conversation,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create conversation',
      },
      { status: 400 }
    )
  }
}
