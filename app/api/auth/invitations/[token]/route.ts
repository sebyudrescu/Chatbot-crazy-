import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { invitationTokenHash, isInvitationToken } from '@/lib/invitation-token'
import { hashUserPassword, verifyUserPassword } from '@/lib/password-hash'
import { issueUserSession, USER_SESSION_COOKIE, USER_SESSION_MAX_AGE_SECONDS } from '@/lib/workspace-auth'
import { checkRateLimit, requestClientIp } from '@/lib/rate-limit'
import { writeWorkspaceAudit } from '@/lib/workspace-audit'

const AcceptSchema = z.object({ displayName: z.string().trim().min(2).max(120), password: z.string().min(10).max(256) })

async function invitationForToken(token: string) {
  if (!isInvitationToken(token)) return null
  return prisma.workspaceInvitation.findUnique({
    where: { tokenHash: invitationTokenHash(token) },
    include: { workspace: { select: { id: true, name: true } } },
  })
}

function invitationUnavailable(invitation: Awaited<ReturnType<typeof invitationForToken>>) {
  return !invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()
}

export async function GET(_request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params
  const invitation = await invitationForToken(token)
  if (invitationUnavailable(invitation)) return NextResponse.json({ success: false, error: 'Invito non valido o scaduto' }, { status: 410 })
  return NextResponse.json({ success: true, data: { email: invitation!.email, role: invitation!.role, workspaceName: invitation!.workspace.name, expiresAt: invitation!.expiresAt } })
}

export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await props.params
    const attempt = await checkRateLimit(`invite-accept:${requestClientIp(request.headers)}:${invitationTokenHash(token).slice(0, 16)}`, 8, 15 * 60 * 1000)
    if (!attempt.allowed) return NextResponse.json({ success: false, error: 'Troppi tentativi. Riprova più tardi.' }, { status: 429 })
    const invitation = await invitationForToken(token)
    if (invitationUnavailable(invitation)) return NextResponse.json({ success: false, error: 'Invito non valido o scaduto' }, { status: 410 })
    const input = AcceptSchema.parse(await request.json())
    const existing = await prisma.user.findUnique({ where: { email: invitation!.email } })
    if (existing?.status === 'disabled') return NextResponse.json({ success: false, error: 'Account disabilitato' }, { status: 403 })
    if (existing?.passwordHash && !await verifyUserPassword(input.password, existing.passwordHash)) {
      return NextResponse.json({ success: false, error: 'Per questo indirizzo esiste già un account: inserisci la sua password corretta' }, { status: 401 })
    }
    const passwordHash = existing?.passwordHash || await hashUserPassword(input.password)
    const acceptedAt = new Date()
    const user = await prisma.$transaction(async tx => {
      const claimed = await tx.workspaceInvitation.updateMany({
        where: { id: invitation!.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: acceptedAt } },
        data: { acceptedAt },
      })
      if (claimed.count !== 1) throw new Error('Invito già utilizzato')
      const account = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { displayName: input.displayName, passwordHash } })
        : await tx.user.create({ data: { email: invitation!.email, displayName: input.displayName, passwordHash } })
      const membership = await tx.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: invitation!.workspaceId, userId: account.id } },
        create: { workspaceId: invitation!.workspaceId, userId: account.id, role: invitation!.role, status: 'active' },
        update: { role: invitation!.role, status: 'active' },
      })
      await writeWorkspaceAudit(tx, {
        workspaceId: invitation!.workspaceId,
        actor: { kind: 'user', userId: account.id, sessionId: null, grants: [] },
        action: 'invitation.accepted',
        targetType: 'workspace_membership',
        targetId: membership.id,
        metadata: { role: invitation!.role },
      })
      return account
    })
    const session = await issueUserSession(user.id, { headers: request.headers })
    const response = NextResponse.json({ success: true, data: { workspaceId: invitation!.workspaceId, workspaceName: invitation!.workspace.name } })
    response.cookies.set(USER_SESSION_COOKIE, session.token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: USER_SESSION_MAX_AGE_SECONDS, priority: 'high' })
    response.cookies.set('litx_owner', '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, priority: 'high' })
    return response
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Accettazione non riuscita' }, { status: 400 })
  }
}
