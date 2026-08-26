import { NextRequest, NextResponse } from 'next/server'
import { getAgentReadiness } from '@/lib/agent-readiness'
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await props.params
  const actor = await requireDashboardActor(request)
  await requireBotPermission(actor, id, 'chatbot.read')
  const readiness = await getAgentReadiness(id)
  if (!readiness) return NextResponse.json({ success: false, error: 'Chatbot not found' }, { status: 404 })
  return NextResponse.json({ success: true, data: readiness })
  } catch (error) { const authResponse = dashboardAuthErrorResponse(error); if (authResponse) return authResponse; return NextResponse.json({ success: false, error: 'Readiness non disponibile' }, { status: 500 }) }
}
