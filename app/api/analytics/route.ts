import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('days') || 30)))
  const since = new Date(Date.now() - days * 86_400_000)
  const [conversations, pipelineEvents, usageEvents, identifiedContacts] = await Promise.all([
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
    prisma.aIUsageEvent.findMany({
      where: { ...(botId ? { botId } : {}), createdAt: { gte: since } },
      select: { feature: true, model: true, totalTokens: true, estimatedCostUsd: true, durationMs: true, success: true },
      take: 10_000,
    }),
    prisma.cRMContact.count({ where: { ...(botId ? { botId } : {}), lastInteraction: { gte: since }, OR: [{ email: { not: null } }, { phone: { not: null } }] } }),
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

  return NextResponse.json({ success: true, data: {
    periodDays: days,
    summary: { conversations: conversations.length, messages: totalMessages, resolved: conversations.filter((item) => item.isResolved).length, handoffs: conversations.filter((item) => item.needsHumanEscalation).length, identifiedContacts, positiveFeedback: positive, negativeFeedback: negative, satisfaction: positive + negative ? Math.round(positive / (positive + negative) * 100) : null, averageMessages: conversations.length ? Number((totalMessages / conversations.length).toFixed(1)) : 0 },
    intents: count(conversations.map((item) => item.userIntent)), sentiments: count(conversations.map((item) => item.sentiment)), byAgent, daily,
    attention: conversations.filter((item) => item.needsHumanEscalation && !item.isResolved).slice(0, 10).map((item) => ({ id: item.id, name: item.userName || item.userEmail || `Visitatore ${item.userSessionId.slice(-6)}`, agent: item.chatbot.companyName, reason: item.escalationReason, lastInteraction: item.lastMessageAt || item.startedAt })),
    negativeFeedback: feedback.filter((item) => item.feedback === 'negative').slice(0, 10),
    pipeline: { stages, aiCostUsd, aiTokens, aiCalls: usageEvents.length },
  } })
}
