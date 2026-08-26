import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

const Schema = z.object({ companyName: z.string().trim().min(1).max(120).optional() })

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireDashboardActor(request)
    const { id } = await props.params
    await requireBotPermission(actor, id, 'chatbot.write')
    const input = Schema.parse(await request.json().catch(() => ({})))
    const source = await prisma.chatbot.findUnique({ where: { id }, include: { embedSettings: true, workflows: true, evaluationCases: true, actions: true } })
    if (!source) return NextResponse.json({ success: false, error: 'Agente non trovato' }, { status: 404 })
    const cloned = await prisma.$transaction(async tx => {
      const agent = await tx.chatbot.create({ data: { workspaceId: source.workspaceId, companyName: input.companyName || `${source.companyName} — Copia`, isActive: false, settings: source.settings, promptTemplateId: source.promptTemplateId, systemPrompt: source.systemPrompt, promptVariables: source.promptVariables, kbStatus: 'empty', kbTotalChunks: 0 } })
      if (source.embedSettings) {
        const { id: _id, chatbotId: _chatbotId, createdAt: _createdAt, updatedAt: _updatedAt, ...appearance } = source.embedSettings
        await tx.embedSettings.create({ data: { ...appearance, enabled: false, allowedDomains: null, chatbotId: agent.id } })
      }
      if (source.workflows.length) await tx.workflow.createMany({ data: source.workflows.map(item => ({ botId: agent.id, name: item.name, description: item.description, triggerType: item.triggerType, steps: item.steps, isActive: false })) })
      if (source.evaluationCases.length) await tx.evaluationCase.createMany({ data: source.evaluationCases.map(item => ({ botId: agent.id, name: item.name, question: item.question, conversationTurns: item.conversationTurns, qualityContract: item.qualityContract, expectedKeywords: item.expectedKeywords, forbiddenKeywords: item.forbiddenKeywords, minimumConfidence: item.minimumConfidence, isActive: item.isActive })) })
      if (source.actions.length) await tx.agentAction.createMany({ data: source.actions.map(item => ({ botId: agent.id, name: item.name, type: item.type, description: item.description, triggerKeywords: item.triggerKeywords, config: item.config, enabled: false })) })
      await tx.promptVersion.create({ data: { botId: agent.id, version: 1, systemPrompt: agent.systemPrompt, promptTemplateId: agent.promptTemplateId, settings: agent.settings || '{}', changeSummary: `Clonato da ${source.companyName}` } })
      return agent
    })
    return NextResponse.json({ success: true, data: cloned, copied: { workflows: source.workflows.length, evaluations: source.evaluationCases.length, actions: source.actions.length, widgetAppearance: Boolean(source.embedSettings), knowledgeSources: 0 } }, { status: 201 })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Clonazione non riuscita' }, { status: 400 })
  }
}
