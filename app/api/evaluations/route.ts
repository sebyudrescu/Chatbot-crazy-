import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { parseKeywords } from '@/lib/evaluation'

const Schema = z.object({ botId: z.string().uuid(), name: z.string().trim().min(1).max(120), question: z.string().trim().min(1).max(2000), expectedKeywords: z.array(z.string().trim().min(1).max(100)).max(20).default([]), forbiddenKeywords: z.array(z.string().trim().min(1).max(100)).max(20).default([]), minimumConfidence: z.number().min(0).max(1).default(0.5), isActive: z.boolean().default(true) })

const serialize = (item: any) => ({ ...item, expectedKeywords: parseKeywords(item.expectedKeywords), forbiddenKeywords: parseKeywords(item.forbiddenKeywords) })

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  const cases = await prisma.evaluationCase.findMany({ where: botId ? { botId } : undefined, include: { chatbot: { select: { id: true, companyName: true } }, runs: { orderBy: { createdAt: 'desc' }, take: 10 } }, orderBy: { updatedAt: 'desc' } })
  return NextResponse.json({ success: true, data: cases.map(serialize) })
}

export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json())
    const created = await prisma.evaluationCase.create({ data: { ...input, expectedKeywords: JSON.stringify(input.expectedKeywords), forbiddenKeywords: JSON.stringify(input.forbiddenKeywords) } })
    return NextResponse.json({ success: true, data: serialize(created) }, { status: 201 })
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Dati non validi' }, { status: 400 }) }
}
