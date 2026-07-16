import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { refreshSuggestions } from '@/lib/suggestion-engine'

const parse = (value: string) => { try { return JSON.parse(value) } catch { return {} } }
export async function GET(request: NextRequest) {
  await refreshSuggestions()
  const status = request.nextUrl.searchParams.get('status') || 'pending', botId = request.nextUrl.searchParams.get('botId')
  const suggestions = await prisma.improvementSuggestion.findMany({ where: { status, ...(botId ? { botId } : {}) }, include: { chatbot: { select: { companyName: true } } }, orderBy: [{ impact: 'asc' }, { updatedAt: 'desc' }] })
  return NextResponse.json({ success: true, data: suggestions.map(item => ({ ...item, actionPayload: parse(item.actionPayload), evidence: parse(item.evidence) })) })
}
