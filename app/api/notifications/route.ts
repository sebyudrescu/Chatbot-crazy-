import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Notification { key: string; type: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string; href: string; createdAt: Date }
export async function GET(request: NextRequest) {
  const limit = Math.min(100, Number(request.nextUrl.searchParams.get('limit')) || 30)
  const staleCutoff = new Date(Date.now() - 20 * 60 * 1000)
  const incidentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [handoffs, failedSources, failedRuns, failedActions, failedIntegrations, ingestionIncidents] = await Promise.all([
    prisma.conversation.findMany({ where: { needsHumanEscalation: true, isResolved: false }, include: { chatbot: { select: { companyName: true } } }, orderBy: { escalatedAt: 'desc' }, take: 30 }),
    prisma.knowledgeSource.findMany({ where: { status: 'failed' }, include: { chatbot: { select: { companyName: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.evaluationRun.findMany({ where: { passed: false }, include: { evaluationCase: { include: { chatbot: { select: { companyName: true } } } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.actionExecution.findMany({ where: { success: false }, include: { action: { include: { chatbot: { select: { companyName: true } } } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.integrationConnection.findMany({ where: { status: 'error' }, include: { chatbot: { select: { companyName: true } } }, orderBy: { updatedAt: 'desc' }, take: 20 }),
    prisma.ingestionJob.findMany({
      where: {
        OR: [
          { status: 'failed', completedAt: { gte: incidentCutoff }, errorMessage: { not: 'Cancelled by user' } },
          { status: 'running', startedAt: { lt: staleCutoff } },
        ],
      },
      include: { chatbot: { select: { companyName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])
  const notifications: Notification[] = [
    ...handoffs.map(item => ({ key: `handoff:${item.id}`, type: 'handoff', severity: 'critical' as const, title: 'Operatore richiesto', description: `${item.chatbot.companyName}: ${item.escalationReason || 'conversazione da prendere in carico'}`, href: `/conversations?conversation=${item.id}`, createdAt: item.escalatedAt || item.startedAt })),
    ...failedSources.map(item => ({ key: `source:${item.id}`, type: 'source', severity: 'warning' as const, title: 'Fonte non sincronizzata', description: `${item.chatbot.companyName}: ${item.originalFilename || item.sourceUrl || 'fonte'} non disponibile`, href: '/knowledge', createdAt: item.createdAt })),
    ...failedRuns.map(item => ({ key: `evaluation:${item.id}`, type: 'evaluation', severity: 'warning' as const, title: 'Valutazione non superata', description: `${item.evaluationCase.chatbot.companyName}: ${item.evaluationCase.name}`, href: '/evaluations', createdAt: item.createdAt })),
    ...failedActions.map(item => ({ key: `action:${item.id}`, type: 'action', severity: 'warning' as const, title: 'Azione non riuscita', description: `${item.action.chatbot.companyName}: ${item.action.name} · ${item.error || 'errore'}`, href: '/actions', createdAt: item.createdAt })),
    ...failedIntegrations.map(item => ({ key: `integration:${item.id}:${item.updatedAt.getTime()}`, type: 'integration', severity: 'warning' as const, title: 'Errore integrazione', description: `${item.chatbot.companyName}: ${item.displayName} · ${item.lastError || 'connessione interrotta'}`, href: '/integrations', createdAt: item.updatedAt })),
    ...ingestionIncidents.map(item => {
      const stale = item.status === 'running'
      return {
        key: `ingestion:${item.id}`,
        type: 'ingestion',
        severity: stale ? 'critical' as const : 'warning' as const,
        title: stale ? 'Crawler bloccato' : 'Importazione non riuscita',
        description: `${item.chatbot.companyName}: ${stale ? 'elaborazione attiva da oltre 20 minuti' : (item.errorMessage || 'la fonte non è stata indicizzata')}`,
        href: `/chatbot/${item.botId}/jobs`,
        createdAt: item.completedAt || item.startedAt || item.createdAt,
      }
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit)
  const states = await prisma.notificationState.findMany({ where: { key: { in: notifications.map(item => item.key) } } }), stateMap = new Map(states.map(item => [item.key, item]))
  const data = notifications.filter(item => !stateMap.get(item.key)?.dismissed).map(item => ({ ...item, read: Boolean(stateMap.get(item.key)?.readAt) }))
  return NextResponse.json({ success: true, data, unread: data.filter(item => !item.read).length })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  if (body.all === true && Array.isArray(body.keys)) {
    await Promise.all(body.keys.slice(0, 200).map((key: string) => prisma.notificationState.upsert({ where: { key }, create: { key, readAt: new Date() }, update: { readAt: new Date() } })))
    return NextResponse.json({ success: true })
  }
  if (typeof body.key !== 'string') return NextResponse.json({ success: false, error: 'Chiave richiesta' }, { status: 400 })
  const state = await prisma.notificationState.upsert({ where: { key: body.key }, create: { key: body.key, readAt: body.dismissed ? null : new Date(), dismissed: Boolean(body.dismissed) }, update: body.dismissed ? { dismissed: true } : { readAt: new Date() } })
  return NextResponse.json({ success: true, data: state })
}
