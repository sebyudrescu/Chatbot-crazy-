import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { safeHttpsUrl } from '@/lib/integration-catalog'

const Schema = z.object({ botId: z.string().uuid(), name: z.string().trim().min(1).max(120), type: z.enum(['booking_link', 'handoff', 'collect_lead', 'webhook']), description: z.string().max(500).optional(), triggerKeywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20), config: z.record(z.string()).default({}), enabled: z.boolean().default(true) })
const serialize = (item: any) => ({ ...item, triggerKeywords: JSON.parse(item.triggerKeywords), config: JSON.parse(item.config) })
function validate(type: string, config: Record<string, string>) { if ((type === 'booking_link' || type === 'webhook') && !safeHttpsUrl(config.url || '')) throw new Error('È richiesto un URL HTTPS pubblico valido') }

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  const actions = await prisma.agentAction.findMany({ where: botId ? { botId } : undefined, include: { chatbot: { select: { companyName: true } }, executions: { orderBy: { createdAt: 'desc' }, take: 10 } }, orderBy: { updatedAt: 'desc' } })
  return NextResponse.json({ success: true, data: actions.map(serialize) })
}
export async function POST(request: NextRequest) {
  try { const input = Schema.parse(await request.json()); validate(input.type, input.config); const action = await prisma.agentAction.create({ data: { ...input, triggerKeywords: JSON.stringify(input.triggerKeywords), config: JSON.stringify(input.config) } }); return NextResponse.json({ success: true, data: serialize(action) }, { status: 201 }) }
  catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Azione non valida' }, { status: 400 }) }
}
