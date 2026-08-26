import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { ChatbotSettingsSchema } from '@/lib/types'
import { calibrateRagThresholds } from '@/lib/retrieval-metrics'
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

const InputSchema = z.object({ botId: z.string().uuid() })

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request)
    const { botId } = InputSchema.parse(await request.json())
    await requireBotPermission(actor, botId, 'chatbot.write')
    const [chatbot, runs] = await Promise.all([
      prisma.chatbot.findUnique({ where: { id: botId }, select: { settings: true } }),
      prisma.evaluationRun.findMany({
        where: { evaluationCase: { botId }, metrics: { not: null } },
        select: { passed: true, confidence: true, metrics: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])
    if (!chatbot) return NextResponse.json({ success: false, error: 'Chatbot non trovato' }, { status: 404 })
    const samples = runs.flatMap((run) => {
      try {
        const metrics = JSON.parse(run.metrics || '{}')
        const retrievalScore = Number(metrics?.retrieval?.topRetrievalScore)
        if (run.confidence == null || !Number.isFinite(retrievalScore)) return []
        return [{ confidence: run.confidence, retrievalScore, passed: run.passed }]
      } catch { return [] }
    })
    if (samples.length < 5) {
      return NextResponse.json({ success: false, error: 'Servono almeno 5 esecuzioni valutate per calibrare le soglie.', data: { sampleCount: samples.length } }, { status: 422 })
    }
    const calibrated = calibrateRagThresholds(samples)
    let current: Record<string, unknown> = {}
    try { current = JSON.parse(chatbot.settings || '{}') } catch {}
    const calibratedAt = new Date().toISOString()
    const settings = ChatbotSettingsSchema.parse({
      ...current,
      retrievalMinScore: calibrated.retrievalMinScore,
      groundingThreshold: calibrated.groundingThreshold,
      ragCalibration: { ...calibrated, calibratedAt },
    })
    await prisma.chatbot.update({ where: { id: botId }, data: { settings: JSON.stringify(settings) } })
    return NextResponse.json({ success: true, data: { ...calibrated, calibratedAt } })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Calibrazione non riuscita' }, { status: 400 })
  }
}
