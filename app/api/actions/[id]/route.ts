import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { safeHttpsUrl } from '@/lib/integration-catalog'

const Schema = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().max(500).nullable().optional(), triggerKeywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20).optional(), config: z.record(z.string()).optional(), enabled: z.boolean().optional() })
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try { const input = Schema.parse(await request.json()), current = await prisma.agentAction.findUnique({ where: { id: params.id } }); if (!current) return NextResponse.json({ success: false, error: 'Azione non trovata' }, { status: 404 }); if (input.config && (current.type === 'webhook' || current.type === 'booking_link') && !safeHttpsUrl(input.config.url || '')) throw new Error('URL HTTPS non valido'); const updated = await prisma.agentAction.update({ where: { id: params.id }, data: { ...input, triggerKeywords: input.triggerKeywords ? JSON.stringify(input.triggerKeywords) : undefined, config: input.config ? JSON.stringify(input.config) : undefined } }); return NextResponse.json({ success: true, data: { ...updated, triggerKeywords: JSON.parse(updated.triggerKeywords), config: JSON.parse(updated.config) } }) }
  catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Aggiornamento non riuscito' }, { status: 400 }) }
}
export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await prisma.agentAction.delete({ where: { id: params.id } });return NextResponse.json({ success: true })
}
