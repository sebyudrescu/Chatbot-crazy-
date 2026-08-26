import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from '@/lib/workspace-auth'

const Schema = z.object({ caseId: z.string().uuid(), passed: z.boolean(), response: z.string().max(20000), confidence: z.number().min(0).max(1).nullable().optional(), latencyMs: z.number().int().nonnegative().nullable().optional(), failureReason: z.string().max(2000).nullable().optional(), conversationId: z.string().uuid().nullable().optional(), metrics: z.record(z.unknown()).nullable().optional() })

export async function POST(request: NextRequest) {
  try { const actor = await requireDashboardActor(request); const data = Schema.parse(await request.json()); await requireResourcePermission(actor, 'evaluation', data.caseId, 'chatbot.write'); const run = await prisma.evaluationRun.create({ data: { ...data, metrics: data.metrics ? JSON.stringify(data.metrics) : null } }); return NextResponse.json({ success: true, data: run }, { status: 201 }) }
  catch (error) { const authResponse = dashboardAuthErrorResponse(error); if (authResponse) return authResponse; return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Risultato non valido' }, { status: 400 }) }
}
