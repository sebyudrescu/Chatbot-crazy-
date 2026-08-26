import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { writeWorkspaceAudit } from '@/lib/workspace-audit'
import { actorCanAccessWorkspace, DashboardAuthError, dashboardAuthErrorResponse, requireDashboardActor } from '@/lib/workspace-auth'

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string; invitationId: string }> }) {
  try {
    const { id, invitationId } = await props.params
    const actor = await requireDashboardActor(request)
    if (!actorCanAccessWorkspace(actor, id, 'members.manage')) throw new DashboardAuthError('Risorsa non trovata', 404)
    const invitation = await prisma.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId: id },
      select: { id: true, role: true, acceptedAt: true, revokedAt: true },
    })
    if (!invitation) throw new DashboardAuthError('Invito non trovato', 404)
    if (invitation.acceptedAt) throw new DashboardAuthError('Un invito già accettato non può essere revocato', 409)
    if (invitation.role === 'owner' && actor.kind === 'user' && !actor.grants.some(grant => grant.workspaceId === id && grant.role === 'owner')) {
      throw new DashboardAuthError('Solo un proprietario può revocare un invito proprietario', 403)
    }

    if (!invitation.revokedAt) {
      await prisma.$transaction(async tx => {
        await tx.workspaceInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } })
        await writeWorkspaceAudit(tx, {
          workspaceId: id,
          actor,
          action: 'invitation.revoked',
          targetType: 'workspace_invitation',
          targetId: invitation.id,
          metadata: { role: invitation.role },
        })
      })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: 'Revoca invito non riuscita' }, { status: 500 })
  }
}
