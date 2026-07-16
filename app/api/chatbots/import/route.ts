import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { normalizeAgentSettings } from '@/lib/ai-models'

const Text = z.string().max(30000)
const Workflow = z.object({ name: z.string().min(1).max(160), description: z.string().max(1000).nullable().optional(), triggerType: z.string().max(80).default('new_message'), steps: z.string().max(200000), isActive: z.boolean().optional() })
const Evaluation = z.object({ name: z.string().min(1).max(160), question: z.string().min(1).max(5000), expectedKeywords: z.string().max(10000), forbiddenKeywords: z.string().max(10000), minimumConfidence: z.number().min(0).max(1), isActive: z.boolean().optional() })
const Action = z.object({ name: z.string().min(1).max(160), type: z.string().max(80), description: z.string().max(1000).nullable().optional(), triggerKeywords: z.array(z.string().max(100)).max(100), config: z.record(z.unknown()), enabled: z.boolean().optional() })
const Widget = z.object({
  title: z.string().max(160).nullable().optional(), subtitle: z.string().max(500).nullable().optional(), theme: z.string().max(30), position: z.string().max(30), primaryColor: z.string().max(30),
  widgetShape: z.string().max(30), iconType: z.string().max(30), iconValue: z.string().max(500), widgetSize: z.string().max(30), animation: z.boolean(), shadow: z.boolean(), gradient: z.boolean(),
  autoOpen: z.boolean(), showLauncher: z.boolean(), customCSS: z.string().max(50000).nullable().optional(),
}).passthrough()
const Backup = z.object({
  format: z.literal('litx-agent-backup'),
  version: z.literal(1),
  agent: z.object({ companyName: z.string().min(1).max(120), settings: z.record(z.unknown()).nullable(), promptTemplateId: z.string().max(120).nullable(), systemPrompt: Text.nullable(), promptVariables: z.record(z.unknown()).nullable() }),
  widget: Widget.nullable().optional(),
  workflows: z.array(Workflow).max(100).default([]),
  evaluations: z.array(Evaluation).max(500).default([]),
  actions: z.array(Action).max(100).default([]),
})

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 2 * 1024 * 1024) return NextResponse.json({ success: false, error: 'Il backup supera il limite di 2 MB' }, { status: 413 })
    const backup = Backup.parse(JSON.parse(raw))
    const created = await prisma.$transaction(async tx => {
      const agent = await tx.chatbot.create({ data: {
        companyName: `${backup.agent.companyName} — Ripristinato`,
        isActive: false,
        settings: JSON.stringify(normalizeAgentSettings(backup.agent.settings)),
        promptTemplateId: backup.agent.promptTemplateId,
        systemPrompt: backup.agent.systemPrompt,
        promptVariables: backup.agent.promptVariables ? JSON.stringify(backup.agent.promptVariables) : null,
        kbStatus: 'empty',
      } })
      if (backup.widget) {
        const widget = backup.widget
        await tx.embedSettings.create({ data: {
          chatbotId: agent.id, enabled: false, title: widget.title, subtitle: widget.subtitle, theme: widget.theme, position: widget.position, primaryColor: widget.primaryColor,
          widgetShape: widget.widgetShape, iconType: widget.iconType, iconValue: widget.iconValue, widgetSize: widget.widgetSize, animation: widget.animation, shadow: widget.shadow, gradient: widget.gradient,
          autoOpen: false, showLauncher: widget.showLauncher, customCSS: widget.customCSS, allowedDomains: null,
        } })
      }
      if (backup.workflows.length) await tx.workflow.createMany({ data: backup.workflows.map(item => ({ botId: agent.id, name: item.name, description: item.description, triggerType: item.triggerType, steps: item.steps, isActive: false })) })
      if (backup.evaluations.length) await tx.evaluationCase.createMany({ data: backup.evaluations.map(item => ({ botId: agent.id, name: item.name, question: item.question, expectedKeywords: item.expectedKeywords, forbiddenKeywords: item.forbiddenKeywords, minimumConfidence: item.minimumConfidence, isActive: item.isActive ?? true })) })
      if (backup.actions.length) await tx.agentAction.createMany({ data: backup.actions.map(item => ({ botId: agent.id, name: item.name, type: item.type, description: item.description, triggerKeywords: JSON.stringify(item.triggerKeywords), config: JSON.stringify(item.config), enabled: false })) })
      await tx.promptVersion.create({ data: { botId: agent.id, version: 1, systemPrompt: agent.systemPrompt, promptTemplateId: agent.promptTemplateId, settings: agent.settings || '{}', changeSummary: 'Ripristinato da backup LitX' } })
      return agent
    })
    return NextResponse.json({ success: true, data: created, imported: { workflows: backup.workflows.length, evaluations: backup.evaluations.length, actions: backup.actions.length, knowledgeSources: 0, integrations: 0 } }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Backup non valido' }, { status: 400 })
  }
}
