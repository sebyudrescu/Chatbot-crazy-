import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseJSON } from '@/lib/utils'

const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  const status = request.nextUrl.searchParams.get('status')
  const conversations = await prisma.conversation.findMany({
    where: {
      ...(botId && botId !== 'all' ? { botId } : {}),
      ...(status === 'open' ? { isResolved: false } : {}),
      ...(status === 'resolved' ? { isResolved: true } : {}),
      ...(status === 'escalated' ? { needsHumanEscalation: true } : {}),
    },
    include: {
      chatbot: { select: { companyName: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 10000,
  })
  const headers = ['ID', 'Agente', 'Data apertura', 'Ultimo messaggio', 'Nome', 'Email', 'Telefono', 'Azienda', 'Stato', 'Handoff', 'Intento', 'Sentiment', 'Messaggi', 'Tag', 'Riepilogo', 'Note interne']
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
}
