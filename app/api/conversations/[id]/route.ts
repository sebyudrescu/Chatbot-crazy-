import { after, NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseJSON } from '@/lib/utils'
import { z } from 'zod'
import { emitIntegrationWebhook } from '@/lib/integration-webhooks'

const ConversationUpdateSchema = z.object({
  isResolved: z.boolean().optional(),
  needsHumanEscalation: z.boolean().optional(),
  assignedAgent: z.string().max(120).nullable().optional(),
  userName: z.string().max(120).nullable().optional(),
  userEmail: z.string().email().nullable().optional(),
  userPhone: z.string().max(60).nullable().optional(),
  userCompany: z.string().max(160).nullable().optional(),
  escalationReason: z.string().max(1000).nullable().optional(),
  summary: z.string().max(5000).nullable().optional(),
  internalNotes: z.string().max(10000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
})

// GET /api/conversations/[id] - Get a specific conversation with messages
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        chatbot: {
          select: {
            id: true,
            companyName: true,
            settings: true,
          },
        },
      },
    })
    
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...conversation,
        tags: parseJSON<string[]>(conversation.tags) || [],
        messages: conversation.messages.map((msg) => ({
          ...msg,
          sourcesUsed: parseJSON(msg.sourcesUsed),
        })),
        chatbot: {
          ...conversation.chatbot,
          settings: parseJSON(conversation.chatbot.settings),
        },
      },
    })
  } catch (error) {
    console.error('Error fetching conversation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch conversation' },
      { status: 500 }
    )
  }
}

// PATCH /api/conversations/[id] - Update inbox/contact state
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const data = ConversationUpdateSchema.parse(await request.json())
    const { tags, ...fields } = data
    const update = {
      ...fields,
      ...(tags ? { tags: JSON.stringify([...new Set(tags.map(tag => tag.toLowerCase()))]) } : {}),
      ...(data.needsHumanEscalation === true ? { escalatedAt: new Date() } : {}),
      ...(data.needsHumanEscalation === false ? { escalationReason: null } : {}),
      ...(data.summary !== undefined ? { lastSummaryAt: new Date() } : {}),
    }
    const conversation = await prisma.conversation.update({ where: { id: params.id }, data: update })
    if (data.needsHumanEscalation === true) {
      after(async () => {
        await emitIntegrationWebhook({
          botId: conversation.botId,
          event: 'conversation.handoff_requested',
          idempotencyKey: `manual-handoff:${conversation.id}:${conversation.escalatedAt?.toISOString() || 'now'}`,
          payload: {
            conversationId: conversation.id,
            reason: conversation.escalationReason || 'Presa in carico manuale',
            assignedAgent: conversation.assignedAgent || null,
          },
        })
      })
    }
    return NextResponse.json({ success: true, data: { ...conversation, tags: parseJSON<string[]>(conversation.tags) || [] } })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Update failed' }, { status: 400 })
  }
}

// DELETE /api/conversations/[id] - Delete a conversation
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await prisma.conversation.delete({
      where: { id: params.id },
    })
    
    return NextResponse.json({
      success: true,
      message: 'Conversation deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete conversation' },
      { status: 400 }
    )
  }
}
