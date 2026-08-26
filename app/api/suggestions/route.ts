import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { refreshSuggestionsIfStale } from '@/lib/suggestion-engine'
import { accessibleBotIds, dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

const parse = (value: string) => { try { return JSON.parse(value) } catch { return {} } }
export async function GET(request: NextRequest) {
  try {
  const actor = await requireDashboardActor(request)
  const refresh = actor.kind === 'legacy_owner' ? await refreshSuggestionsIfStale().catch(() => ({ refreshed: false, reason: 'failed' as const })) : { refreshed: false, reason: 'client_scope' as const }
  const status = request.nextUrl.searchParams.get('status') || 'pending', botId = request.nextUrl.searchParams.get('botId')
  if (botId) await requireBotPermission(actor, botId, 'chatbot.read')
  const ids = botId ? null : await accessibleBotIds(actor, 'chatbot.read')
  const suggestions = await prisma.improvementSuggestion.findMany({ where: { status, ...(botId ? { botId } : ids === null ? {} : { botId: { in: ids } }) }, include: { chatbot: { select: { companyName: true } } }, orderBy: [{ impact: 'asc' }, { updatedAt: 'desc' }] })
  return NextResponse.json({ success: true, data: suggestions.map(item => ({ ...item, actionPayload: parse(item.actionPayload), evidence: parse(item.evidence) })), refresh })
  } catch (error) { const authResponse = dashboardAuthErrorResponse(error); if (authResponse) return authResponse; return NextResponse.json({ success: false, error: 'Suggerimenti non disponibili' }, { status: 500 }) }
}
