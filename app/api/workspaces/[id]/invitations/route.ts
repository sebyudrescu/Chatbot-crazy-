import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { actorCanAccessWorkspace, DashboardAuthError, dashboardAuthErrorResponse, requireDashboardActor } from '@/lib/workspace-auth'
import { createInvitationToken, invitationTokenHash } from '@/lib/invitation-token'
import { writeWorkspaceAudit } from '@/lib/workspace-audit'

const InviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(['owner', 'admin', 'operator', 'viewer']).default('viewer'),
  expiresInHours: z.number().int().min(1).max(168).default(72),
})

async function requireMemberManager(request: NextRequest, workspaceId: string) {
  const actor = await requireDashboardActor(request)
  if (!actorCanAccessWorkspace(actor, workspaceId, 'members.manage')) throw new DashboardAuthError('Risorsa non trovata', 404)
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } })
  if (!workspace) throw new DashboardAuthError('Risorsa non trovata', 404)
  return { actor, workspace }
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    await requireMemberManager(request, id)
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { workspaceId: id },
      select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ success: true, data: invitations })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: 'Impossibile caricare gli inviti' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const { actor, workspace } = await requireMemberManager(request, id)
    const input = InviteSchema.parse(await request.json())
    if (input.role === 'owner' && actor.kind === 'user' && !actor.grants.some(grant => grant.workspaceId === id && grant.role === 'owner')) {
      throw new DashboardAuthError('Solo un proprietario può invitare un altro proprietario', 403)
    }
    const email = input.email.toLowerCase()
    const token = createInvitationToken()
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.workspaceInvitation.updateMany({
        where: { workspaceId: id, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      })
      const invitation = await tx.workspaceInvitation.create({
        data: {
          workspaceId: id,
          email,
          role: input.role,
          tokenHash: invitationTokenHash(token),
          expiresAt: new Date(now.getTime() + input.expiresInHours * 60 * 60_000),
          createdByUserId: actor.kind === 'user' ? actor.userId : null,
        },
      })
      await writeWorkspaceAudit(tx, {
        workspaceId: id,
        actor,
        action: 'invitation.created',
        targetType: 'workspace_invitation',
        targetId: invitation.id,
        metadata: { role: input.role, expiresInHours: input.expiresInHours },
      })
    })
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    return NextResponse.json({
      success: true,
      data: { email, role: input.role, workspaceName: workspace.name, acceptUrl: `${appUrl}/accept-invite?token=${encodeURIComponent(token)}` },
    }, { status: 201 })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invito non riuscito' }, { status: 400 })
  }
}
