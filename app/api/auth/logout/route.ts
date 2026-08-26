import { NextRequest, NextResponse } from 'next/server'
import { revokeUserSession, USER_SESSION_COOKIE } from '@/lib/workspace-auth'

export async function POST(request: NextRequest) {
  const userSession = request.cookies.get(USER_SESSION_COOKIE)?.value
  if (userSession) await revokeUserSession(userSession)
  const response = NextResponse.json({ success: true })
  response.cookies.set('litx_owner', '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, priority: 'high' })
  response.cookies.set(USER_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, priority: 'high' })
  return response
}
