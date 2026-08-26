import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { parseKeywords } from '@/lib/evaluation'
import { conversationQualityContractSchema } from '@/lib/conversation-quality-benchmark'
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from '@/lib/workspace-auth'

const PatchSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), question: z.string().trim().min(1).max(2000).optional(), conversationTurns: z.array(z.string().trim().min(1).max(2000)).max(8).optional(), qualityContract: conversationQualityContractSchema.nullable().optional(), expectedKeywords: z.array(z.string().trim().min(1).max(100)).max(20).optional(), forbiddenKeywords: z.array(z.string().trim().min(1).max(100)).max(20).optional(), minimumConfidence: z.number().min(0).max(1).optional(), isActive: z.boolean().optional() })
const parseMetrics = (value: string | null | undefined) => { try { return value ? JSON.parse(value) : null } catch { return null } }

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireDashboardActor(request)
    await requireResourcePermission(actor, 'evaluation', params.id, 'chatbot.write')
    const input = PatchSchema.parse(await request.json())
    const updated = await prisma.evaluationCase.update({ where: { id: params.id }, data: { ...input, conversationTurns: input.conversationTurns ? JSON.stringify(input.conversationTurns) : undefined, qualityContract: input.qualityContract === undefined ? undefined : input.qualityContract ? JSON.stringify(input.qualityContract) : null, expectedKeywords: input.expectedKeywords ? JSON.stringify(input.expectedKeywords) : undefined, forbiddenKeywords: input.forbiddenKeywords ? JSON.stringify(input.forbiddenKeywords) : undefined } })
    return NextResponse.json({ success: true, data: { ...updated, conversationTurns: parseKeywords(updated.conversationTurns), qualityContract: parseMetrics(updated.qualityContract), expectedKeywords: parseKeywords(updated.expectedKeywords), forbiddenKeywords: parseKeywords(updated.forbiddenKeywords) } })
  } catch (error) { const authResponse=dashboardAuthErrorResponse(error);if(authResponse)return authResponse;return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Aggiornamento non riuscito' }, { status: 400 }) }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try { const actor=await requireDashboardActor(request);await requireResourcePermission(actor,'evaluation',params.id,'chatbot.write');await prisma.evaluationCase.delete({ where: { id: params.id } }); return NextResponse.json({ success: true }) }
  catch(error) { const authResponse=dashboardAuthErrorResponse(error);if(authResponse)return authResponse;return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 }) }
}
