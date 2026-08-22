import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { parseKeywords } from '@/lib/evaluation'
import { conversationQualityContractSchema } from '@/lib/conversation-quality-benchmark'

const Schema = z.object({ botId: z.string().uuid(), name: z.string().trim().min(1).max(120), question: z.string().trim().min(1).max(2000), conversationTurns: z.array(z.string().trim().min(1).max(2000)).max(8).default([]), qualityContract: conversationQualityContractSchema.nullable().default(null), expectedKeywords: z.array(z.string().trim().min(1).max(100)).max(20).default([]), forbiddenKeywords: z.array(z.string().trim().min(1).max(100)).max(20).default([]), minimumConfidence: z.number().min(0).max(1).default(0.5), isActive: z.boolean().default(true) })

const parseMetrics = (value: string | null | undefined) => { try { return value ? JSON.parse(value) : null } catch { return null } }
const serialize = (item: any) => ({ ...item, conversationTurns: parseKeywords(item.conversationTurns), qualityContract: parseMetrics(item.qualityContract), expectedKeywords: parseKeywords(item.expectedKeywords), forbiddenKeywords: parseKeywords(item.forbiddenKeywords), runs: item.runs?.map((run: any) => ({ ...run, metrics: parseMetrics(run.metrics) })) })

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  const cases = await prisma.evaluationCase.findMany({ where: botId ? { botId } : undefined, include: { chatbot: { select: { id: true, companyName: true } }, runs: { orderBy: { createdAt: 'desc' }, take: 10 } }, orderBy: { updatedAt: 'desc' } })
  return NextResponse.json({ success: true, data: cases.map(serialize) })
}

export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json())
    const created = await prisma.evaluationCase.create({ data: { ...input, conversationTurns: JSON.stringify(input.conversationTurns), qualityContract: input.qualityContract ? JSON.stringify(input.qualityContract) : null, expectedKeywords: JSON.stringify(input.expectedKeywords), forbiddenKeywords: JSON.stringify(input.forbiddenKeywords) } })
    return NextResponse.json({ success: true, data: serialize(created) }, { status: 201 })
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Dati non validi' }, { status: 400 }) }
}
