import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseMetaConnection } from '@/lib/meta-connections'
import { parseShopifyConfig } from '@/lib/shopify-auth'
import { errorRateAlert, operationalWindowKey, tokenExpiryAlert } from '@/lib/operational-alert-policy'
import { redactOperationalText } from '@/lib/operational-error-safety'

interface Notification { key: string; type: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string; href: string; createdAt: Date }
export async function GET(request: NextRequest) {
  const now = new Date()
  const limit = Math.min(100, Number(request.nextUrl.searchParams.get('limit')) || 30)
  const staleCutoff = new Date(now.getTime() - 20 * 60 * 1000)
  const commerceStaleCutoff = new Date(now.getTime() - 30 * 60 * 1000)
  const errorRateCutoff = new Date(now.getTime() - 60 * 60 * 1000)
  const recentIncidentCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const incidentCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const [handoffs, failedSources, failedRuns, failedActions, failedIntegrations, ingestionIncidents, commerceSyncIncidents, commerceWebhookFailures, expiringConnections, eventTotals, eventFailures, systemErrors] = await Promise.all([
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
    prisma.productSyncJob.findMany({
      where: {
        OR: [
          { status: 'failed', completedAt: { gte: recentIncidentCutoff } },
          { status: 'running', startedAt: { lt: commerceStaleCutoff } },
        ],
      },
      include: { chatbot: { select: { companyName: true } }, source: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.commerceWebhookDelivery.findMany({
      where: { status: 'failed', updatedAt: { gte: recentIncidentCutoff } },
      include: { chatbot: { select: { companyName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.integrationConnection.findMany({
      where: { enabled: true, status: { in: ['connected', 'syncing'] }, provider: { in: ['whatsapp', 'instagram', 'shopify'] } },
      include: { chatbot: { select: { companyName: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.event.groupBy({
      by: ['botId'],
      where: { botId: { not: null }, timestamp: { gte: errorRateCutoff } },
      _count: { _all: true },
    }),
    prisma.event.groupBy({
      by: ['botId'],
      where: { botId: { not: null }, success: false, severity: { in: ['error', 'critical'] }, timestamp: { gte: errorRateCutoff } },
      _count: { _all: true },
    }),
    prisma.event.findMany({
      where: {
        eventType: 'system.request.unhandled',
        severity: { in: ['error', 'critical'] },
        timestamp: { gte: incidentCutoff },
      },
      orderBy: { timestamp: 'desc' },
      take: 20,
    }),
  ])
  const botIds = eventTotals.map(item => item.botId).filter((id): id is string => Boolean(id))
  const botNames = new Map((await prisma.chatbot.findMany({ where: { id: { in: botIds } }, select: { id: true, companyName: true } })).map(item => [item.id, item.companyName]))
  const failuresByBot = new Map(eventFailures.map(item => [item.botId, item._count._all]))
  const errorRateNotifications: Notification[] = eventTotals.flatMap(item => {
    if (!item.botId) return []
    const alert = errorRateAlert(item._count._all, failuresByBot.get(item.botId) || 0)
    if (!alert) return []
    return [{
      key: operationalWindowKey('error-rate', item.botId, now.getTime()),
      type: 'system',
      severity: alert.level,
      title: alert.level === 'critical' ? 'Error rate critico' : 'Error rate elevato',
      description: `${botNames.get(item.botId) || 'Agente'}: ${(alert.rate * 100).toFixed(1)}% di eventi falliti nell’ultima ora su ${item._count._all} eventi`,
      href: '/dashboard/traces',
      createdAt: now,
    }]
  })
  const tokenNotifications: Notification[] = expiringConnections.flatMap(connection => {
    let expiresAt: string | undefined
    try {
      if (connection.provider === 'shopify') {
        const config = parseShopifyConfig(connection.config)
        expiresAt = config.refreshTokenExpiresAt || (!config.refreshToken ? config.accessTokenExpiresAt : undefined)
      } else {
        const config = parseMetaConnection(connection.config)
        if (!config) throw new Error('Configurazione Meta non valida')
        expiresAt = config.tokenExpiresAt
      }
    } catch {
      return [{ key: `token-config:${connection.id}:${connection.updatedAt.getTime()}`, type: 'integration', severity: 'critical' as const, title: 'Credenziali integrazione non leggibili', description: `${connection.chatbot.companyName}: ricollega ${connection.displayName}`, href: '/integrations', createdAt: connection.updatedAt }]
    }
    const alert = tokenExpiryAlert(expiresAt, now.getTime())
    if (!alert) return []
    const expiryKey = alert.expiresAt.getTime() > 0 ? alert.expiresAt.getTime() : connection.updatedAt.getTime()
    return [{
      key: `token-expiry:${connection.id}:${expiryKey}`,
      type: 'integration',
      severity: alert.level,
      title: alert.level === 'critical' ? 'Token integrazione scaduto' : 'Token integrazione in scadenza',
      description: `${connection.chatbot.companyName}: ${connection.displayName} ${alert.level === 'critical' ? 'deve essere ricollegata' : `scade il ${alert.expiresAt.toLocaleDateString('it-IT')}`}`,
      href: '/integrations',
      createdAt: now,
    }]
  })
  const notifications: Notification[] = [
    ...handoffs.flatMap(item => {
      const now = Date.now()
      const cycle = item.handoffSequence || 1
      const base: Notification[] = [{ key: `handoff:${item.id}:${cycle}`, type: 'handoff', severity: 'critical', title: 'Operatore richiesto', description: `${item.chatbot.companyName}: ${item.escalationReason || 'conversazione da prendere in carico'}`, href: `/conversations?conversation=${item.id}`, createdAt: item.escalatedAt || item.startedAt }]
      if (!item.firstHumanResponseAt && item.firstResponseDueAt && item.firstResponseDueAt.getTime() < now) base.push({ key: `sla-first:${item.id}:${cycle}`, type: 'sla', severity: 'critical', title: 'SLA prima risposta superato', description: `${item.chatbot.companyName}: la conversazione attende una risposta umana`, href: `/conversations?conversation=${item.id}`, createdAt: item.firstResponseDueAt })
      if (item.resolutionDueAt && item.resolutionDueAt.getTime() < now) base.push({ key: `sla-resolution:${item.id}:${cycle}`, type: 'sla', severity: 'warning', title: 'SLA risoluzione superato', description: `${item.chatbot.companyName}: la conversazione è ancora aperta`, href: `/conversations?conversation=${item.id}`, createdAt: item.resolutionDueAt })
      return base
    }),
    ...failedSources.map(item => ({ key: `source:${item.id}`, type: 'source', severity: 'warning' as const, title: 'Fonte non sincronizzata', description: `${item.chatbot.companyName}: ${item.originalFilename || item.sourceUrl || 'fonte'} non disponibile`, href: '/knowledge', createdAt: item.createdAt })),
    ...failedRuns.map(item => ({ key: `evaluation:${item.id}`, type: 'evaluation', severity: 'warning' as const, title: 'Valutazione non superata', description: `${item.evaluationCase.chatbot.companyName}: ${item.evaluationCase.name}`, href: '/evaluations', createdAt: item.createdAt })),
    ...failedActions.map(item => ({ key: `action:${item.id}`, type: 'action', severity: 'warning' as const, title: 'Azione non riuscita', description: `${item.action.chatbot.companyName}: ${item.action.name} · ${redactOperationalText(item.error || 'errore', 180)}`, href: '/actions', createdAt: item.createdAt })),
    ...failedIntegrations.map(item => ({ key: `integration:${item.id}:${item.updatedAt.getTime()}`, type: 'integration', severity: 'warning' as const, title: 'Errore integrazione', description: `${item.chatbot.companyName}: ${item.displayName} · ${redactOperationalText(item.lastError || 'connessione interrotta', 180)}`, href: '/integrations', createdAt: item.updatedAt })),
    ...ingestionIncidents.map(item => {
      const stale = item.status === 'running'
      return {
        key: `ingestion:${item.id}`,
        type: 'ingestion',
        severity: stale ? 'critical' as const : 'warning' as const,
        title: stale ? 'Crawler bloccato' : 'Importazione non riuscita',
        description: `${item.chatbot.companyName}: ${stale ? 'elaborazione attiva da oltre 20 minuti' : redactOperationalText(item.errorMessage || 'la fonte non è stata indicizzata', 180)}`,
        href: `/chatbot/${item.botId}/jobs`,
        createdAt: item.completedAt || item.startedAt || item.createdAt,
      }
    }),
    ...commerceSyncIncidents.map(item => {
      const stale = item.status === 'running'
      return {
        key: `commerce-sync:${item.id}:${item.leaseVersion}`,
        type: 'integration',
        severity: stale ? 'critical' as const : 'warning' as const,
        title: stale ? 'Sincronizzazione catalogo bloccata' : 'Sincronizzazione catalogo fallita',
        description: `${item.chatbot.companyName}: ${item.source.name} · ${stale ? 'nessun checkpoint da oltre 30 minuti' : redactOperationalText(item.errorMessage || 'sincronizzazione non completata', 240)}`,
        href: '/commerce',
        createdAt: item.completedAt || item.startedAt || item.createdAt,
      }
    }),
    ...commerceWebhookFailures.map(item => ({
      key: `commerce-webhook:${item.id}`,
      type: 'integration',
      severity: 'warning' as const,
      title: 'Webhook commerce non elaborato',
      description: `${item.chatbot.companyName}: ${item.provider} · ${item.topic}`,
      href: '/integrations',
      createdAt: item.updatedAt,
    })),
    ...tokenNotifications,
    ...errorRateNotifications,
    ...systemErrors.map(item => ({
      key: `system-error:${item.id}`,
      type: 'system',
      severity: 'critical' as const,
      title: 'Errore server rilevato',
      description: 'Una richiesta server non gestita ha generato un errore. Consulta le tracce operative per il dettaglio redatto.',
      href: '/dashboard/traces',
      createdAt: item.timestamp,
    })),
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
