import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

const parse = (value: string) => { try { return JSON.parse(value) } catch { return {} } }
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
  const params = await props.params;
  const actor = await requireDashboardActor(request)
  await requireBotPermission(actor, params.id, 'chatbot.read')
  const versions = await prisma.promptVersion.findMany({ where: { botId: params.id }, orderBy: { version: 'desc' }, take: 100 })
  return NextResponse.json({ success: true, data: versions.map(item => ({ ...item, settings: parse(item.settings) })) })
  } catch (error) { const authResponse = dashboardAuthErrorResponse(error); if (authResponse) return authResponse; return NextResponse.json({ success: false, error: 'Versioni non disponibili' }, { status: 500 }) }
}
