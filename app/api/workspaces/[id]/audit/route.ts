import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { actorCanAccessWorkspace, DashboardAuthError, dashboardAuthErrorResponse, requireDashboardActor } from '@/lib/workspace-auth'

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const actor = await requireDashboardActor(request)
    if (!actorCanAccessWorkspace(actor, id, 'members.manage')) throw new DashboardAuthError('Risorsa non trovata', 404)
    const events = await prisma.workspaceAuditLog.findMany({
      where: { workspaceId: id },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ success: true, data: events })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: 'Audit non disponibile' }, { status: 500 })
  }
}
