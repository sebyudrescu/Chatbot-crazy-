import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculateHelpDeskSlaAnalytics } from '@/lib/helpdesk-operations'
import { buildRecurringTopicInsights, buildRevisionOutcomeInsights } from '@/lib/conversation-insights'
import { buildActionPerformance, buildChannelPerformance, buildCommerceFunnelComparison, buildLeadPipeline, buildNoMatchComparison, comparePeriods } from '@/lib/commercial-analytics'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('days') || 30)))
  const currentEnd = new Date()
  const since = new Date(currentEnd.getTime() - days * 86_400_000)
  const previousSince = new Date(since.getTime() - days * 86_400_000)
  const [conversations, pipelineEvents, helpdeskEvents, usageEvents, identifiedContacts, helpdeskRows, publishedRevisions, qualityMessages, previousConversationCount, previousMessageCount, commerceEvents, commercialMessages, crmContacts, actionExecutions] = await Promise.all([
    prisma.conversation.findMany({
      where: { ...(botId ? { botId } : {}), startedAt: { gte: since } },
      include: { chatbot: { select: { id: true, companyName: true } }, _count: { select: { messages: true } } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.event.findMany({
      where: { ...(botId ? { botId } : {}), timestamp: { gte: since }, eventType: 'pipeline.stage.completed' },
      select: { durationMs: true, success: true, metadata: true },
      take: 10_000,
    }),
    prisma.event.findMany({
      where: {
        ...(botId ? { botId } : {}),
        eventType: { startsWith: 'helpdesk.' },
        timestamp: { gte: new Date(since.getTime() - 365 * 86_400_000) },
      },
      select: { conversationId: true, eventType: true, timestamp: true, metadata: true },
      orderBy: { timestamp: 'asc' },
      take: 50_000,
    }),
    prisma.aIUsageEvent.findMany({
      where: { ...(botId ? { botId } : {}), createdAt: { gte: since } },
      select: { feature: true, model: true, totalTokens: true, estimatedCostUsd: true, durationMs: true, success: true },
      take: 10_000,
    }),
    prisma.cRMContact.count({ where: { ...(botId ? { botId } : {}), lastInteraction: { gte: since }, OR: [{ email: { not: null } }, { phone: { not: null } }] } }),
    prisma.conversation.findMany({
      where: {
        ...(botId ? { botId } : {}),
        OR: [
          { escalatedAt: { gte: since } },
          { resolvedAt: { gte: since } },
          { needsHumanEscalation: true, isResolved: false },
        ],
      },
      select: {
        id: true, priority: true, channel: true, isResolved: true, needsHumanEscalation: true,
        escalatedAt: true, firstResponseDueAt: true, resolutionDueAt: true,
        firstHumanResponseAt: true, resolvedAt: true,
      },
      take: 10_000,
    }),
    prisma.responseRevision.findMany({
      where: { ...(botId ? { botId } : {}), status: 'published', knowledgeSourceId: { not: null }, publishedAt: { not: null } },
      select: { id: true, botId: true, question: true, knowledgeSourceId: true, publishedAt: true },
      take: 2_000,
    }),
    prisma.message.findMany({
      where: { role: 'assistant', createdAt: { gte: since }, ...(botId ? { conversation: { botId } } : {}) },
      select: { conversationId: true, feedback: true, sourcesUsed: true, createdAt: true, conversation: { select: { botId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    }),
    prisma.conversation.count({
      where: { ...(botId ? { botId } : {}), startedAt: { gte: previousSince, lt: since } },
    }),
    prisma.message.count({
      where: { conversation: { ...(botId ? { botId } : {}), startedAt: { gte: previousSince, lt: since } } },
    }),
    prisma.commerceEvent.findMany({
      where: {
        ...(botId ? { botId } : {}),
        createdAt: { gte: previousSince, lt: currentEnd },
        eventType: { in: ['impression', 'click', 'add_to_cart', 'checkout', 'conversion'] },
      },
      select: { id: true, botId: true, conversationId: true, sessionId: true, eventType: true, value: true, currency: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 50_001,
    }),
    prisma.message.findMany({
      where: { role: 'assistant', createdAt: { gte: previousSince, lt: currentEnd }, ...(botId ? { conversation: { botId } } : {}) },
      select: { sourcesUsed: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 50_001,
    }),
    prisma.cRMContact.findMany({
      where: { ...(botId ? { botId } : {}) },
      select: { stage: true, source: true, createdAt: true, lastInteraction: true },
      orderBy: { lastInteraction: 'desc' },
      take: 50_001,
    }),
    prisma.actionExecution.findMany({
      where: { createdAt: { gte: since, lt: currentEnd }, ...(botId ? { action: { botId } } : {}) },
      select: {
        conversationId: true, success: true, status: true, durationMs: true, createdAt: true,
        action: { select: { id: true, botId: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50_001,
    }),
  ])
  const ids = conversations.map((item) => item.id)
  const feedback = ids.length ? await prisma.message.findMany({ where: { conversationId: { in: ids }, feedback: { not: null } }, select: { id: true, conversationId: true, feedback: true, feedbackComment: true, content: true, createdAt: true } }) : []
  const count = (values: (string | null)[]) => [...values.reduce((map, value) => map.set(value || 'Non rilevato', (map.get(value || 'Non rilevato') || 0) + 1), new Map<string, number>())].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  const byAgent = [...conversations.reduce((map, item) => { const current = map.get(item.chatbot.id) || { id: item.chatbot.id, name: item.chatbot.companyName, conversations: 0, messages: 0, resolved: 0, handoffs: 0 }; current.conversations++; current.messages += item._count.messages; if (item.isResolved) current.resolved++; if (item.needsHumanEscalation) current.handoffs++; map.set(item.chatbot.id, current); return map }, new Map<string, { id: string; name: string; conversations: number; messages: number; resolved: number; handoffs: number }>()).values()]
  const daily = [...conversations.reduce((map, item) => { const day = item.startedAt.toISOString().slice(0, 10); map.set(day, (map.get(day) || 0) + 1); return map }, new Map<string, number>())].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date))
  const positive = feedback.filter((item) => item.feedback === 'positive').length
  const negative = feedback.filter((item) => item.feedback === 'negative').length
  const totalMessages = conversations.reduce((sum, item) => sum + item._count.messages, 0)

  const stages = [...pipelineEvents.reduce((map, event) => {
    let metadata: any = {}
    try { metadata = JSON.parse(event.metadata || '{}') } catch {}
    const stage = String(metadata.stage || 'unknown')
    const current = map.get(stage) || { stage, calls: 0, successes: 0, totalLatencyMs: 0, totalCostUsd: 0, totalTokens: 0 }
    current.calls++
    if (event.success) current.successes++
    current.totalLatencyMs += event.durationMs || 0
    current.totalCostUsd += Number(metadata.estimatedCostUsd) || 0
    current.totalTokens += Number(metadata.totalTokens) || 0
    map.set(stage, current)
    return map
  }, new Map<string, { stage: string; calls: number; successes: number; totalLatencyMs: number; totalCostUsd: number; totalTokens: number }>()).values()].map((stage) => ({
    ...stage,
    averageLatencyMs: stage.calls ? Math.round(stage.totalLatencyMs / stage.calls) : 0,
    successRate: stage.calls ? Math.round(stage.successes / stage.calls * 100) : 0,
    totalCostUsd: Number(stage.totalCostUsd.toFixed(6)),
  })).sort((left, right) => left.stage.localeCompare(right.stage))
  const aiCostUsd = Number(usageEvents.reduce((sum, event) => sum + event.estimatedCostUsd, 0).toFixed(6))
  const aiTokens = usageEvents.reduce((sum, event) => sum + event.totalTokens, 0)
  const now = new Date()
  const qualityByConversation = qualityMessages.reduce((map, message) => {
    const current = map.get(message.conversationId) || { negativeFeedback: 0, lowConfidenceAnswers: 0 }
    if (message.feedback === 'negative') current.negativeFeedback++
    try {
      const confidence = JSON.parse(message.sourcesUsed || '{}')?.metadata?.confidence
      if (typeof confidence === 'number' && confidence < 0.55) current.lowConfidenceAnswers++
    } catch {}
    map.set(message.conversationId, current)
    return map
  }, new Map<string, { negativeFeedback: number; lowConfidenceAnswers: number }>())
  const recurringTopics = buildRecurringTopicInsights(conversations.map((conversation) => ({
    id: conversation.id,
    botId: conversation.botId,
    channel: conversation.channel,
    topicsDiscussed: conversation.topicsDiscussed,
    needsHumanEscalation: conversation.needsHumanEscalation,
    negativeFeedback: qualityByConversation.get(conversation.id)?.negativeFeedback || 0,
    lowConfidenceAnswers: qualityByConversation.get(conversation.id)?.lowConfidenceAnswers || 0,
  })))
  const revisionOutcomes = buildRevisionOutcomeInsights(publishedRevisions, qualityMessages.map((message) => ({
    botId: message.conversation.botId,
    createdAt: message.createdAt,
    feedback: message.feedback,
    sourcesUsed: message.sourcesUsed,
  })))
  const helpdesk = helpdeskRows.map((item) => ({ ...item, sla: calculateHelpDeskSlaAnalytics(item, now) }))
  const historicalCycles = reconstructHelpDeskCycles(helpdeskEvents)
  const firstResponseCompleted = historicalCycles.filter((cycle) => cycle.escalatedAt && cycle.escalatedAt >= since && cycle.firstHumanResponseAt && cycle.firstResponseDueAt)
  const resolutionCompleted = historicalCycles.filter((cycle) => cycle.resolvedAt && cycle.resolvedAt >= since && cycle.resolutionDueAt)
  const firstResponseSamples = firstResponseCompleted.map((cycle) => Math.max(0, cycle.firstHumanResponseAt!.getTime() - cycle.escalatedAt!.getTime()))
  const resolutionSamples = resolutionCompleted.map((cycle) => Math.max(0, cycle.resolvedAt!.getTime() - cycle.escalatedAt!.getTime()))
  const commercialLimits = {
    commerceEvents: commerceEvents.length > 50_000,
    assistantMessages: commercialMessages.length > 50_000,
    crmContacts: crmContacts.length > 50_000,
    actionExecutions: actionExecutions.length > 50_000,
  }
  const commerceFunnel = buildCommerceFunnelComparison(commerceEvents.slice(0, 50_000), previousSince, since, currentEnd)
  const noMatch = buildNoMatchComparison(commercialMessages.slice(0, 50_000), previousSince, since, currentEnd)
  const leadPipeline = buildLeadPipeline(crmContacts.slice(0, 50_000), previousSince, since, currentEnd)
  const channelPerformance = buildChannelPerformance(conversations, commerceEvents.slice(0, 50_000), crmContacts.slice(0, 50_000), since, currentEnd)
  const actionPerformance = buildActionPerformance(actionExecutions.slice(0, 50_000), since, currentEnd)
  const conversions = commerceFunnel.stages.find((stage) => stage.stage === 'conversion')?.comparison || comparePeriods(0, 0)

  return NextResponse.json({ success: true, data: {
    periodDays: days,
    summary: { conversations: conversations.length, messages: totalMessages, resolved: conversations.filter((item) => item.isResolved).length, handoffs: conversations.filter((item) => item.needsHumanEscalation).length, identifiedContacts, positiveFeedback: positive, negativeFeedback: negative, satisfaction: positive + negative ? Math.round(positive / (positive + negative) * 100) : null, averageMessages: conversations.length ? Number((totalMessages / conversations.length).toFixed(1)) : 0 },
    intents: count(conversations.map((item) => item.userIntent)), sentiments: count(conversations.map((item) => item.sentiment)), byAgent, daily,
    attention: conversations.filter((item) => item.needsHumanEscalation && !item.isResolved).slice(0, 10).map((item) => ({ id: item.id, name: item.userName || item.userEmail || `Visitatore ${item.userSessionId.slice(-6)}`, agent: item.chatbot.companyName, reason: item.escalationReason, lastInteraction: item.lastMessageAt || item.startedAt })),
    negativeFeedback: feedback.filter((item) => item.feedback === 'negative').slice(0, 10),
    pipeline: { stages, aiCostUsd, aiTokens, aiCalls: usageEvents.length },
    quality: {
      recurringTopics,
      revisionOutcomes,
      note: 'Risultati aggregati osservati; non dimostrano causalità e non applicano modifiche automatiche.',
    },
    commercial: {
      period: { currentStart: since, currentEnd, previousStart: previousSince },
      comparison: {
        conversations: comparePeriods(conversations.length, previousConversationCount),
        messages: comparePeriods(totalMessages, previousMessageCount),
        newContacts: leadPipeline.created,
        productSearches: comparePeriods(noMatch.searches, noMatch.previous.searches),
        noMatches: comparePeriods(noMatch.noMatches, noMatch.previous.noMatches),
        conversions,
      },
      funnel: commerceFunnel,
      leads: leadPipeline,
      noMatch,
      channels: channelPerformance,
      actions: actionPerformance,
      dataQuality: { complete: !Object.values(commercialLimits).some(Boolean), truncatedSources: Object.entries(commercialLimits).filter(([, truncated]) => truncated).map(([source]) => source) },
      note: 'Funnel deduplicato per conversazione/sessione. Il fatturato include solo conversioni firmate e non gli item; canali e fasi lead sono aggregati senza PII. Le azioni mostrano affidabilità operativa, non attribuzione delle vendite.',
    },
    helpdesk: {
      backlog: helpdesk.filter((item) => item.needsHumanEscalation && !item.isResolved).length,
      overdueFirstResponse: helpdesk.filter((item) => item.sla.firstResponseStatus === 'breached' && !item.firstHumanResponseAt).length,
      overdueResolution: helpdesk.filter((item) => item.sla.resolutionStatus === 'breached' && !item.resolvedAt).length,
      firstResponseAttainment: firstResponseCompleted.length ? Math.round(firstResponseCompleted.filter((cycle) => cycle.firstResponseDueAt && cycle.firstHumanResponseAt! <= cycle.firstResponseDueAt).length / firstResponseCompleted.length * 100) : null,
      resolutionAttainment: resolutionCompleted.length ? Math.round(resolutionCompleted.filter((cycle) => cycle.resolutionDueAt && cycle.resolvedAt! <= cycle.resolutionDueAt).length / resolutionCompleted.length * 100) : null,
      firstResponseMedianMs: percentile(firstResponseSamples, 0.5),
      firstResponseP90Ms: percentile(firstResponseSamples, 0.9),
      resolutionMedianMs: percentile(resolutionSamples, 0.5),
      resolutionP90Ms: percentile(resolutionSamples, 0.9),
      byPriority: count(helpdesk.map((item) => item.priority)),
      byChannel: count(helpdesk.map((item) => item.channel)),
    },
  } })
}

interface HelpDeskCycleSnapshot {
  escalatedAt: Date | null
  firstResponseDueAt: Date | null
  resolutionDueAt: Date | null
  firstHumanResponseAt: Date | null
  resolvedAt: Date | null
}

function reconstructHelpDeskCycles(events: Array<{ conversationId: string | null; eventType: string; timestamp: Date; metadata: string | null }>) {
  const cycles = new Map<string, HelpDeskCycleSnapshot>()
  for (const event of events) {
    if (!event.conversationId) continue
    let metadata: Record<string, unknown> = {}
    try { metadata = JSON.parse(event.metadata || '{}') } catch {}
    const sequence = Number(metadata.handoffSequence)
    if (!Number.isInteger(sequence) || sequence < 1) continue
    const key = `${event.conversationId}:${sequence}`
    const current = cycles.get(key) || {
      escalatedAt: null, firstResponseDueAt: null, resolutionDueAt: null,
      firstHumanResponseAt: null, resolvedAt: null,
    }
    current.escalatedAt = dateValue(metadata.escalatedAt) || current.escalatedAt
    current.firstResponseDueAt = dateValue(metadata.firstResponseDueAt) || current.firstResponseDueAt
    current.resolutionDueAt = dateValue(metadata.resolutionDueAt) || current.resolutionDueAt
    current.firstHumanResponseAt = earlier(current.firstHumanResponseAt, dateValue(metadata.firstHumanResponseAt))
    current.resolvedAt = dateValue(metadata.resolvedAt) || current.resolvedAt
    if (event.eventType === 'helpdesk.handoff_requested' && !current.escalatedAt) current.escalatedAt = event.timestamp
    if (event.eventType === 'helpdesk.operator_replied' && !current.firstHumanResponseAt) current.firstHumanResponseAt = event.timestamp
    if (event.eventType === 'helpdesk.resolved' && !current.resolvedAt) current.resolvedAt = event.timestamp
    cycles.set(key, current)
  }
  return [...cycles.values()].filter((cycle) => cycle.escalatedAt)
}

function dateValue(value: unknown) {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function earlier(current: Date | null, candidate: Date | null) {
  if (!candidate) return current
  return !current || candidate < current ? candidate : current
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(quantile * sorted.length) - 1]
}
