import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { accessToken, constantTimeEqual, createOwnerSessionToken, OWNER_SESSION_MAX_AGE_SECONDS } from '@/lib/auth-token'
import { checkRateLimit, requestClientIp } from '@/lib/rate-limit'
import { prisma } from '@/lib/db'
import { issueUserSession, USER_SESSION_COOKIE, USER_SESSION_MAX_AGE_SECONDS } from '@/lib/workspace-auth'
import { verifyUserPassword } from '@/lib/password-hash'

const Schema = z.object({ email: z.string().trim().email().max(320).optional(), password: z.string().min(1).max(500) })

export async function POST(request: NextRequest) {
  let input: z.infer<typeof Schema>
  try { input = Schema.parse(await request.json()) } catch { return NextResponse.json({ success: false, error: 'Richiesta non valida' }, { status: 400 }) }
  const normalizedEmail = input.email?.toLowerCase()
  const attempt = await checkRateLimit(`${normalizedEmail ? 'user' : 'owner'}-login:${requestClientIp(request.headers)}:${normalizedEmail || '-'}`, 8, 15 * 60 * 1000)
  if (!attempt.allowed) {
    return NextResponse.json(
      { success: false, error: 'Troppi tentativi. Riprova più tardi.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((attempt.resetAt - Date.now()) / 1000))) } }
    )
  }
  if (normalizedEmail) {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { memberships: { where: { status: 'active' }, select: { workspaceId: true, role: true } } },
    })
    const valid = Boolean(user?.passwordHash) && await verifyUserPassword(input.password, user!.passwordHash!)
    if (!user || user.status !== 'active' || !valid || user.memberships.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 350))
      return NextResponse.json({ success: false, error: 'Credenziali non corrette' }, { status: 401 })
    }
    const session = await issueUserSession(user.id)
    const response = NextResponse.json({ success: true, mode: 'client', data: { displayName: user.displayName, memberships: user.memberships } })
    response.cookies.set(USER_SESSION_COOKIE, session.token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: USER_SESSION_MAX_AGE_SECONDS, priority: 'high' })
    response.cookies.set('litx_owner', '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, priority: 'high' })
    return response
  }
  const configured = process.env.APP_ACCESS_PASSWORD
  if (!configured) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ success: false, error: 'Accesso proprietario non configurato' }, { status: 503 })
    return NextResponse.json({ success: true, protectionDisabled: true })
  }
  try {
    const salt = process.env.APP_AUTH_SALT || 'litx-private-owner'
    const [received, expected] = await Promise.all([accessToken(input.password, salt), accessToken(configured, salt)])
    if (!constantTimeEqual(received, expected)) {
      await new Promise(resolve => setTimeout(resolve, 350))
      return NextResponse.json({ success: false, error: 'Password non corretta' }, { status: 401 })
    }
    const sessionToken = await createOwnerSessionToken(configured, salt)
    const response = NextResponse.json({ success: true, mode: 'owner' })
    response.cookies.set('litx_owner', sessionToken, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: OWNER_SESSION_MAX_AGE_SECONDS, priority: 'high' })
    response.cookies.set(USER_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, priority: 'high' })
    return response
  } catch { return NextResponse.json({ success: false, error: 'Richiesta non valida' }, { status: 400 }) }
}
