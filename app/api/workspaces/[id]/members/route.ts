import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { actorCanAccessWorkspace, DashboardAuthError, dashboardAuthErrorResponse, requireDashboardActor } from '@/lib/workspace-auth'

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const actor = await requireDashboardActor(request)
    if (!actorCanAccessWorkspace(actor, id, 'members.manage')) throw new DashboardAuthError('Risorsa non trovata', 404)
    const workspace = await prisma.workspace.findUnique({ where: { id }, select: { id: true } })
    if (!workspace) throw new DashboardAuthError('Risorsa non trovata', 404)

    const memberships = await prisma.workspaceMembership.findMany({
      where: { workspaceId: id },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, email: true, displayName: true, status: true } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ success: true, data: memberships })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: 'Impossibile caricare i membri' }, { status: 500 })
  }
}
