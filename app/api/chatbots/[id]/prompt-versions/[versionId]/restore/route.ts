import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeAgentSettings } from '@/lib/ai-models'
import { parseJSON, stringifyJSON } from '@/lib/utils'
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
  const params = await props.params;
  const actor = await requireDashboardActor(request)
  await requireBotPermission(actor, params.id, 'chatbot.write')
  const version = await prisma.promptVersion.findFirst({ where: { id: params.versionId, botId: params.id } })
  if (!version) return NextResponse.json({ success: false, error: 'Versione non trovata' }, { status: 404 })
  const restoredSettings = stringifyJSON(normalizeAgentSettings(parseJSON(version.settings)))
  const restored = await prisma.$transaction(async tx => {
    const chatbot = await tx.chatbot.update({ where: { id: params.id }, data: { systemPrompt: version.systemPrompt, promptTemplateId: version.promptTemplateId, settings: restoredSettings } })
    const latest = await tx.promptVersion.aggregate({ where: { botId: params.id }, _max: { version: true } })
    await tx.promptVersion.create({ data: { botId: params.id, version: (latest._max.version || 0) + 1, systemPrompt: version.systemPrompt, promptTemplateId: version.promptTemplateId, settings: restoredSettings, changeSummary: `Ripristinata versione ${version.version}` } })
    return chatbot
  })
  return NextResponse.json({ success: true, data: { ...restored, settings: JSON.parse(restored.settings || '{}') } })
  } catch (error) { const authResponse = dashboardAuthErrorResponse(error); if (authResponse) return authResponse; return NextResponse.json({ success: false, error: 'Ripristino non riuscito' }, { status: 400 }) }
}
