import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { parseJSON } from '@/lib/utils'
import { accessibleBotIds, dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`

export async function GET(request: NextRequest) {
  try {
  const actor = await requireDashboardActor(request)
  const botId = request.nextUrl.searchParams.get('botId')
  if (botId && botId !== 'all') await requireBotPermission(actor, botId, 'conversation.read')
  const accessibleIds = botId && botId !== 'all' ? null : await accessibleBotIds(actor, 'conversation.read')
  const status = request.nextUrl.searchParams.get('status')
  const priority = request.nextUrl.searchParams.get('priority')
  const channel = request.nextUrl.searchParams.get('channel')
  const sla = request.nextUrl.searchParams.get('sla')
  const now = new Date()
  const dueSoon = new Date(now.getTime() + 30 * 60_000)
  const slaWhere: Prisma.ConversationWhereInput = sla === 'breached'
    ? { needsHumanEscalation: true, isResolved: false, OR: [{ firstHumanResponseAt: null, firstResponseDueAt: { lt: now } }, { resolutionDueAt: { lt: now } }] }
    : sla === 'due_soon'
      ? { needsHumanEscalation: true, isResolved: false, OR: [{ firstHumanResponseAt: null, firstResponseDueAt: { gte: now, lte: dueSoon } }, { resolutionDueAt: { gte: now, lte: dueSoon } }] }
      : sla === 'untracked'
        ? { escalatedAt: null }
        : {}
  const conversations = await prisma.conversation.findMany({
    where: {
      ...(botId && botId !== 'all' ? { botId } : accessibleIds === null ? {} : { botId: { in: accessibleIds } }),
      ...(status === 'open' ? { isResolved: false } : {}),
      ...(status === 'resolved' ? { isResolved: true } : {}),
      ...(status === 'escalated' ? { needsHumanEscalation: true } : {}),
      ...(priority && priority !== 'all' ? { priority } : {}),
      ...(channel && channel !== 'all' ? { channel } : {}),
      ...slaWhere,
    },
    include: {
      chatbot: { select: { companyName: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 10000,
  })
  const headers = ['ID', 'Agente', 'Data apertura', 'Ultimo messaggio', 'Nome', 'Email', 'Telefono', 'Azienda', 'Stato', 'Handoff', 'Priorità', 'Scadenza prima risposta', 'Prima risposta umana', 'Scadenza risoluzione', 'Risolta il', 'Intento', 'Sentiment', 'Messaggi', 'Tag', 'Riepilogo', 'Note interne']
  const rows = conversations.map(item => [
    item.id,
    item.chatbot.companyName,
    item.startedAt.toISOString(),
    item.lastMessageAt?.toISOString() || '',
    item.userName || '',
    item.userEmail || '',
    item.userPhone || '',
    item.userCompany || '',
    item.isResolved ? 'Risolta' : 'Aperta',
    item.needsHumanEscalation ? 'Sì' : 'No',
    item.priority,
    item.firstResponseDueAt?.toISOString() || '',
    item.firstHumanResponseAt?.toISOString() || '',
    item.resolutionDueAt?.toISOString() || '',
    item.resolvedAt?.toISOString() || '',
    item.userIntent || '',
    item.sentiment || '',
    item._count.messages,
    (parseJSON<string[]>(item.tags) || []).join(', '),
    item.summary || '',
    item.internalNotes || '',
  ])
  const csv = `\uFEFF${[headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n')}`
  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="conversazioni-${date}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: 'Esportazione non riuscita' }, { status: 500 })
  }
}
