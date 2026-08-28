import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { dashboardAuthErrorResponse, requireDashboardActor } from '@/lib/workspace-auth'

export async function GET(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request)
    if (actor.kind === 'legacy_owner') return NextResponse.json({ success: true, data: { mode: 'owner', displayName: 'LitX Agency' } })
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        mfaEnabledAt: true,
        memberships: {
          where: { status: 'active' },
          select: { role: true, workspace: { select: { id: true, name: true, slug: true } } },
        },
      },
    })
    if (!user) return NextResponse.json({ success: false, error: 'Account non disponibile' }, { status: 401 })
    const { mfaEnabledAt, ...safeUser } = user
    return NextResponse.json({ success: true, data: { mode: 'client', ...safeUser, mfaEnabled: Boolean(mfaEnabledAt) } })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: 'Sessione non disponibile' }, { status: 500 })
  }
}
