import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { accessibleBotIds, dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
  const actor = await requireDashboardActor(request)
  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('days') || 30)))
  const botId = request.nextUrl.searchParams.get('botId')
  if (botId) await requireBotPermission(actor, botId, 'analytics.read')
  const ids = botId ? null : await accessibleBotIds(actor, 'analytics.read')
  const since = new Date(Date.now() - days * 86400000)
  const where = { createdAt: { gte: since }, ...(botId ? { botId } : ids === null ? {} : { botId: { in: ids } }) }
  const [summary, byModel, byFeature, byBot, events] = await Promise.all([
    prisma.aIUsageEvent.aggregate({ where, _count: { id: true }, _sum: { inputTokens: true, cachedInputTokens: true, outputTokens: true, totalTokens: true, estimatedCostUsd: true, durationMs: true } }),
    prisma.aIUsageEvent.groupBy({ by: ['model'], where, _count: { id: true }, _sum: { totalTokens: true, estimatedCostUsd: true } }),
    prisma.aIUsageEvent.groupBy({ by: ['feature'], where, _count: { id: true }, _sum: { totalTokens: true, estimatedCostUsd: true } }),
    prisma.aIUsageEvent.groupBy({ by: ['botId'], where, _count: { id: true }, _sum: { totalTokens: true, estimatedCostUsd: true } }),
    prisma.aIUsageEvent.findMany({ where, select: { createdAt: true, totalTokens: true, estimatedCostUsd: true }, orderBy: { createdAt: 'asc' }, take: 100000 }),
  ])
  const botIds = byBot.map(item => item.botId).filter((id): id is string => Boolean(id))
  const bots = botIds.length ? await prisma.chatbot.findMany({ where: { id: { in: botIds } }, select: { id: true, companyName: true } }) : []
  const names = new Map(bots.map(bot => [bot.id, bot.companyName]))
  const daily = [...events.reduce((map, event) => {
    const date = event.createdAt.toISOString().slice(0, 10)
    const current = map.get(date) || { date, calls: 0, tokens: 0, costUsd: 0 }
    current.calls += 1; current.tokens += event.totalTokens; current.costUsd += event.estimatedCostUsd
    map.set(date, current)
    return map
  }, new Map<string, { date: string; calls: number; tokens: number; costUsd: number }>()).values()].map(item => ({ ...item, costUsd: Number(item.costUsd.toFixed(6)) }))
  const calls = summary._count.id
  return NextResponse.json({ success: true, data: {
    periodDays: days,
    summary: { calls, inputTokens: summary._sum.inputTokens || 0, cachedInputTokens: summary._sum.cachedInputTokens || 0, outputTokens: summary._sum.outputTokens || 0, totalTokens: summary._sum.totalTokens || 0, estimatedCostUsd: Number((summary._sum.estimatedCostUsd || 0).toFixed(6)), averageLatencyMs: calls ? Math.round((summary._sum.durationMs || 0) / calls) : 0 },
    byModel: byModel.map(item => ({ model: item.model, calls: item._count.id, tokens: item._sum.totalTokens || 0, costUsd: Number((item._sum.estimatedCostUsd || 0).toFixed(6)) })).sort((a, b) => b.costUsd - a.costUsd),
    byFeature: byFeature.map(item => ({ feature: item.feature, calls: item._count.id, tokens: item._sum.totalTokens || 0, costUsd: Number((item._sum.estimatedCostUsd || 0).toFixed(6)) })).sort((a, b) => b.costUsd - a.costUsd),
    byAgent: byBot.map(item => ({ botId: item.botId, name: item.botId ? names.get(item.botId) || 'Agente eliminato' : 'Strumenti generali', calls: item._count.id, tokens: item._sum.totalTokens || 0, costUsd: Number((item._sum.estimatedCostUsd || 0).toFixed(6)) })).sort((a, b) => b.costUsd - a.costUsd),
    daily,
    pricingUpdatedAt: '2026-08-09',
  } })
  } catch (error) { const authResponse = dashboardAuthErrorResponse(error); if (authResponse) return authResponse; return NextResponse.json({ success: false, error: 'Utilizzo AI non disponibile' }, { status: 500 }) }
}
