import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const Schema = z.object({ name: z.string().trim().max(120).nullable().optional(), email: z.string().email().nullable().optional(), phone: z.string().trim().max(50).nullable().optional(), company: z.string().trim().max(120).nullable().optional(), stage: z.enum(['new', 'qualified', 'appointment', 'proposal', 'client', 'lost']).optional(), potentialValue: z.number().nonnegative().max(100000000).nullable().optional(), tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(), consentStatus: z.enum(['unknown', 'granted', 'denied']).optional(), note: z.string().trim().min(1).max(2000).optional() })
const parse = (value: string) => { try { return JSON.parse(value) } catch { return [] } }
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const input = Schema.parse(await request.json()), current = await prisma.cRMContact.findUnique({ where: { id: params.id } })
    if (!current) return NextResponse.json({ success: false, error: 'Contatto non trovato' }, { status: 404 })
    const { tags, note, ...fields } = input
    const notes = note ? [...parse(current.notes), { id: crypto.randomUUID(), text: note, createdAt: new Date().toISOString() }] : undefined
    const updated = await prisma.cRMContact.update({ where: { id: params.id }, data: { ...fields, tags: tags ? JSON.stringify(tags) : undefined, notes: notes ? JSON.stringify(notes) : undefined } })
    return NextResponse.json({ success: true, data: { ...updated, tags: parse(updated.tags), notes: parse(updated.notes) } })
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Aggiornamento non riuscito' }, { status: 400 }) }
}
