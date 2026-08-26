import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CreateConversationSchema } from '@/lib/types'
import { isAllowedWidgetOrigin } from '@/lib/widget-origin'
import { parseJSON } from '@/lib/utils'
import { syncCRMContactFromConversation } from '@/lib/crm-sync'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { allowedWorkspaceIds, dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

const ConversationListQuerySchema = z.object({
  botId: z.string().uuid().optional(),
  userSessionId: z.string().max(200).optional(),
  status: z.enum(['all', 'open', 'handoff', 'resolved']).default('all'),
  priority: z.enum(['all', 'low', 'normal', 'high', 'urgent']).default('all'),
  channel: z.string().trim().min(1).max(40).default('all'),
  assignment: z.enum(['all', 'assigned', 'unassigned']).default('all'),
  sla: z.enum(['all', 'healthy', 'due_soon', 'breached', 'untracked']).default('all'),
  sort: z.enum(['recent', 'oldest']).default('recent'),
  q: z.string().trim().max(120).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

// GET /api/conversations - List conversations
export async function GET(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request)
    const query = ConversationListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()))
    if (query.botId) await requireBotPermission(actor, query.botId, 'conversation.read')
    const workspaceIds = allowedWorkspaceIds(actor, 'conversation.read')
    const now = new Date()
    const dueSoon = new Date(now.getTime() + 30 * 60_000)
    const slaWhere: Prisma.ConversationWhereInput = query.sla === 'breached'
      ? { needsHumanEscalation: true, isResolved: false, OR: [{ firstHumanResponseAt: null, firstResponseDueAt: { lt: now } }, { resolutionDueAt: { lt: now } }] }
      : query.sla === 'due_soon'
        ? { needsHumanEscalation: true, isResolved: false, OR: [{ firstHumanResponseAt: null, firstResponseDueAt: { gte: now, lte: dueSoon } }, { resolutionDueAt: { gte: now, lte: dueSoon } }] }
        : query.sla === 'untracked'
          ? { needsHumanEscalation: true, isResolved: false, OR: [
              { resolutionDueAt: null },
              { firstHumanResponseAt: null, firstResponseDueAt: null },
            ] }
          : query.sla === 'healthy'
            ? { needsHumanEscalation: true, isResolved: false, resolutionDueAt: { not: null, gte: now }, OR: [
                { firstHumanResponseAt: { not: null } },
                { firstHumanResponseAt: null, firstResponseDueAt: { not: null, gte: now } },
              ] }
            : {}
    const cursor = decodeConversationCursor(query.cursor)
    const cursorWhere: Prisma.ConversationWhereInput = !cursor
      ? {}
      : query.sort === 'oldest'
        ? { OR: [
            { startedAt: { gt: cursor.startedAt } },
            { startedAt: cursor.startedAt, id: { gt: cursor.id } },
          ] }
        : cursor.lastMessageAt
          ? { OR: [
              { lastMessageAt: { lt: cursor.lastMessageAt } },
              { lastMessageAt: cursor.lastMessageAt, startedAt: { lt: cursor.startedAt } },
              { lastMessageAt: cursor.lastMessageAt, startedAt: cursor.startedAt, id: { lt: cursor.id } },
              { lastMessageAt: null },
            ] }
          : { lastMessageAt: null, OR: [
              { startedAt: { lt: cursor.startedAt } },
              { startedAt: cursor.startedAt, id: { lt: cursor.id } },
            ] }
    const where: Prisma.ConversationWhereInput = {
      ...(workspaceIds === null ? {} : { chatbot: { workspaceId: { in: workspaceIds } } }),
      ...(query.botId ? { botId: query.botId } : {}),
      ...(query.userSessionId ? { userSessionId: query.userSessionId } : {}),
      ...(query.status === 'open' ? { isResolved: false } : {}),
      ...(query.status === 'resolved' ? { isResolved: true } : {}),
      ...(query.status === 'handoff' ? { needsHumanEscalation: true, isResolved: false } : {}),
      ...(query.priority !== 'all' ? { priority: query.priority } : {}),
      ...(query.channel !== 'all' ? { channel: query.channel } : {}),
      ...(query.assignment === 'assigned' ? { assignedAgent: { not: null } } : {}),
      ...(query.assignment === 'unassigned' ? { assignedAgent: null } : {}),
      AND: [
        slaWhere,
        cursorWhere,
        ...(query.q ? [{ OR: [
          { userName: { contains: query.q, mode: 'insensitive' as const } },
          { userEmail: { contains: query.q, mode: 'insensitive' as const } },
          { userPhone: { contains: query.q, mode: 'insensitive' as const } },
          { userSessionId: { contains: query.q, mode: 'insensitive' as const } },
          { messages: { some: { content: { contains: query.q, mode: 'insensitive' as const } } } },
        ] }] : []),
      ],
    }
    
    const conversations = await prisma.conversation.findMany({
      where,
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
      orderBy: query.sort === 'oldest'
        ? [{ startedAt: 'asc' }, { id: 'asc' }]
        : [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { startedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    })
    const hasMore = conversations.length > query.limit
    const page = hasMore ? conversations.slice(0, query.limit) : conversations
    
    return NextResponse.json({
      success: true,
      data: page.map(conversation => ({
        ...conversation,
        tags: parseJSON<string[]>(conversation.tags) || [],
      })),
      pagination: { nextCursor: hasMore ? encodeConversationCursor(page.at(-1)!) : null },
    })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Error fetching conversations:', error)
    return NextResponse.json(
      { success: false, error: error instanceof z.ZodError ? 'Filtri conversazione non validi' : 'Failed to fetch conversations' },
      { status: error instanceof z.ZodError ? 400 : 500 }
    )
  }
}

function encodeConversationCursor(value: { id: string; startedAt: Date; lastMessageAt: Date | null }) {
  return Buffer.from(JSON.stringify({
    id: value.id,
    startedAt: value.startedAt.toISOString(),
    lastMessageAt: value.lastMessageAt?.toISOString() || null,
  }), 'utf8').toString('base64url')
}

function decodeConversationCursor(value?: string) {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>
    if (typeof parsed.id !== 'string' || typeof parsed.startedAt !== 'string') throw new Error('bad cursor')
    const startedAt = new Date(parsed.startedAt)
    const lastMessageAt = typeof parsed.lastMessageAt === 'string' ? new Date(parsed.lastMessageAt) : null
    if (Number.isNaN(startedAt.getTime()) || (lastMessageAt && Number.isNaN(lastMessageAt.getTime()))) throw new Error('bad cursor')
    return { id: parsed.id, startedAt, lastMessageAt }
  } catch {
    throw new z.ZodError([{ code: 'custom', path: ['cursor'], message: 'Cursore non valido' }])
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
    await syncCRMContactFromConversation(conversation.id)
    
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
