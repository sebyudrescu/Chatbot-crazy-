import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { writeWorkspaceAudit } from '@/lib/workspace-audit'
import { actorCanAccessWorkspace, DashboardAuthError, dashboardAuthErrorResponse, requireDashboardActor } from '@/lib/workspace-auth'

const UpdateMembershipSchema = z.object({
  role: z.enum(['owner', 'admin', 'operator', 'viewer']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
}).refine(input => input.role !== undefined || input.status !== undefined, 'Nessuna modifica richiesta')

function actorIsWorkspaceOwner(actor: Awaited<ReturnType<typeof requireDashboardActor>>, workspaceId: string) {
  return actor.kind === 'legacy_owner' || actor.grants.some(grant => grant.workspaceId === workspaceId && grant.role === 'owner')
}

async function requireManagedMembership(request: NextRequest, workspaceId: string, membershipId: string) {
  const actor = await requireDashboardActor(request)
  if (!actorCanAccessWorkspace(actor, workspaceId, 'members.manage')) throw new DashboardAuthError('Risorsa non trovata', 404)
  const membership = await prisma.workspaceMembership.findFirst({
    where: { id: membershipId, workspaceId },
    select: { id: true, userId: true, role: true, status: true },
  })
  if (!membership) throw new DashboardAuthError('Membro non trovato', 404)
  return { actor, membership }
}

async function assertOwnerContinuity(client: Prisma.TransactionClient, workspaceId: string, membership: { id: string; role: string; status: string }) {
  if (membership.role !== 'owner' || membership.status !== 'active') return
  const remainingOwners = await client.workspaceMembership.count({
    where: { workspaceId, id: { not: membership.id }, role: 'owner', status: 'active' },
  })
  if (remainingOwners === 0) throw new DashboardAuthError('Il workspace deve mantenere almeno un proprietario attivo', 409)
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string; membershipId: string }> }) {
  try {
    const { id, membershipId } = await props.params
    const { actor, membership } = await requireManagedMembership(request, id, membershipId)
    const input = UpdateMembershipSchema.parse(await request.json())
    const changesOwnerRole = membership.role === 'owner' || input.role === 'owner'
    if (changesOwnerRole && !actorIsWorkspaceOwner(actor, id)) {
      throw new DashboardAuthError('Solo un proprietario può modificare il ruolo proprietario', 403)
    }
    const updated = await prisma.$transaction(async tx => {
      if (((input.role && input.role !== 'owner') || input.status === 'suspended') && membership.role === 'owner' && membership.status === 'active') {
        await assertOwnerContinuity(tx, id, membership)
      }
      const result = await tx.workspaceMembership.update({
        where: { id: membership.id },
        data: { role: input.role, status: input.status },
        select: { id: true, role: true, status: true, user: { select: { id: true, email: true, displayName: true, status: true } } },
      })
      await writeWorkspaceAudit(tx, {
        workspaceId: id,
        actor,
        action: 'membership.updated',
        targetType: 'workspace_membership',
        targetId: membership.id,
        metadata: { previousRole: membership.role, previousStatus: membership.status, role: result.role, status: result.status },
      })
      return result
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: error.issues[0]?.message || 'Dati non validi' }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Modifica membro non riuscita' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string; membershipId: string }> }) {
  try {
    const { id, membershipId } = await props.params
    const { actor, membership } = await requireManagedMembership(request, id, membershipId)
    if (membership.role === 'owner') {
      if (!actorIsWorkspaceOwner(actor, id)) throw new DashboardAuthError('Solo un proprietario può rimuovere un proprietario', 403)
    }

    await prisma.$transaction(async tx => {
      if (membership.role === 'owner') await assertOwnerContinuity(tx, id, membership)
      await writeWorkspaceAudit(tx, {
        workspaceId: id,
        actor,
        action: 'membership.removed',
        targetType: 'workspace_membership',
        targetId: membership.id,
        metadata: { role: membership.role, status: membership.status },
      })
      await tx.workspaceMembership.delete({ where: { id: membership.id } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ success: true })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: 'Rimozione membro non riuscita' }, { status: 500 })
  }
}
