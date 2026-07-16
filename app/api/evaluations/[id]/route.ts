import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { parseKeywords } from '@/lib/evaluation'

const PatchSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), question: z.string().trim().min(1).max(2000).optional(), expectedKeywords: z.array(z.string().trim().min(1).max(100)).max(20).optional(), forbiddenKeywords: z.array(z.string().trim().min(1).max(100)).max(20).optional(), minimumConfidence: z.number().min(0).max(1).optional(), isActive: z.boolean().optional() })

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const input = PatchSchema.parse(await request.json())
    const updated = await prisma.evaluationCase.update({ where: { id: params.id }, data: { ...input, expectedKeywords: input.expectedKeywords ? JSON.stringify(input.expectedKeywords) : undefined, forbiddenKeywords: input.forbiddenKeywords ? JSON.stringify(input.forbiddenKeywords) : undefined } })
    return NextResponse.json({ success: true, data: { ...updated, expectedKeywords: parseKeywords(updated.expectedKeywords), forbiddenKeywords: parseKeywords(updated.forbiddenKeywords) } })
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Aggiornamento non riuscito' }, { status: 400 }) }
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try { await prisma.evaluationCase.delete({ where: { id: params.id } }); return NextResponse.json({ success: true }) }
  catch { return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 }) }
}
