import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const Schema = z.object({ status: z.enum(['pending', 'saved', 'dismissed']) })
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try { const { status } = Schema.parse(await request.json()); const updated = await prisma.improvementSuggestion.update({ where: { id: params.id }, data: { status } }); return NextResponse.json({ success: true, data: updated }) }
  catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Aggiornamento non riuscito' }, { status: 400 }) }
}
