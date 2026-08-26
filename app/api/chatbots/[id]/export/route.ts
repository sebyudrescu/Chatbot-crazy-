import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseJSON } from '@/lib/utils'
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

const sensitive = /secret|password|token|api[_-]?key|authorization|private[_-]?key/i
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? '[REDACTED]' : redact(item)]))
  return value
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await props.params
  const actor = await requireDashboardActor(request)
  await requireBotPermission(actor, id, 'chatbot.read')
  const agent = await prisma.chatbot.findUnique({ where: { id }, include: { embedSettings: true, workflows: true, evaluationCases: true, actions: true, integrations: true } })
  if (!agent) return NextResponse.json({ success: false, error: 'Agente non trovato' }, { status: 404 })
  const data = {
    format: 'litx-agent-backup', version: 1, exportedAt: new Date().toISOString(),
    excludes: ['knowledge sources and vectors', 'conversations and contacts', 'credentials and execution logs'],
    agent: { companyName: agent.companyName, settings: redact(parseJSON(agent.settings)), promptTemplateId: agent.promptTemplateId, systemPrompt: agent.systemPrompt, promptVariables: redact(parseJSON(agent.promptVariables)) },
    widget: agent.embedSettings ? { ...agent.embedSettings, id: undefined, chatbotId: undefined, createdAt: undefined, updatedAt: undefined, enabled: false, allowedDomains: null } : null,
    workflows: agent.workflows.map(({ id: _id, botId: _botId, createdAt: _createdAt, updatedAt: _updatedAt, ...item }) => ({ ...item, isActive: false })),
    evaluations: agent.evaluationCases.map(({ id: _id, botId: _botId, createdAt: _createdAt, updatedAt: _updatedAt, ...item }) => item),
    actions: agent.actions.map(({ id: _id, botId: _botId, createdAt: _createdAt, updatedAt: _updatedAt, ...item }) => ({ ...item, config: redact(parseJSON(item.config)), triggerKeywords: parseJSON(item.triggerKeywords), enabled: false })),
    integrations: agent.integrations.map(item => ({ provider: item.provider, category: item.category, displayName: item.displayName, enabled: false, config: redact(parseJSON(item.config)) })),
  }
  const filename = agent.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agente'
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}-backup.json"`, 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: 'Esportazione non riuscita' }, { status: 500 })
  }
}
