import { NextRequest, NextResponse } from 'next/server'
import { getAgentReadiness } from '@/lib/agent-readiness'

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const readiness = await getAgentReadiness(id)
  if (!readiness) return NextResponse.json({ success: false, error: 'Chatbot not found' }, { status: 404 })
  return NextResponse.json({ success: true, data: readiness })
}
