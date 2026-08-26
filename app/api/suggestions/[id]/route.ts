import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { buildSuggestionAuditEvent } from '@/lib/suggestion-audit'
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from '@/lib/workspace-auth'

const Schema = z.object({ status: z.enum(['pending', 'saved', 'dismissed']) })
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireDashboardActor(request)
    await requireResourcePermission(actor, 'suggestion', params.id, 'chatbot.write')
    const { status } = Schema.parse(await request.json())
    const updated = await prisma.$transaction(async tx => {
      const current = await tx.improvementSuggestion.findUnique({ where: { id: params.id } })
      if (!current) return null
      if (current.status === status) return current
      const changed = await tx.improvementSuggestion.updateMany({ where: { id: current.id, status: current.status }, data: { status } })
      if (changed.count !== 1) throw new Error('suggestion_conflict')
      await tx.event.create({ data: buildSuggestionAuditEvent({
        suggestionId: current.id,
        botId: current.botId,
        actionType: current.actionType,
        previousStatus: current.status,
        outcome: status === 'pending' ? 'restored' : status,
      }) })
      return tx.improvementSuggestion.findUnique({ where: { id: current.id } })
    })
    if (!updated) return NextResponse.json({ success: false, error: 'Suggerimento non trovato' }, { status: 404 })
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'Stato non valido' }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Aggiornamento non riuscito' }, { status: 409 })
  }
}
