import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { accessToken } from '@/lib/auth-token'
import { checkRateLimit, requestClientIp } from '@/lib/rate-limit'

const Schema = z.object({ password: z.string().min(1).max(500) })

export async function POST(request: NextRequest) {
  const configured = process.env.APP_ACCESS_PASSWORD
  if (!configured) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ success: false, error: 'Accesso proprietario non configurato' }, { status: 503 })
    return NextResponse.json({ success: true, protectionDisabled: true })
  }
  const attempt = checkRateLimit(`owner-login:${requestClientIp(request.headers)}`, 8, 15 * 60 * 1000)
  if (!attempt.allowed) {
    return NextResponse.json(
      { success: false, error: 'Troppi tentativi. Riprova più tardi.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((attempt.resetAt - Date.now()) / 1000))) } }
    )
  }
  try {
    const { password } = Schema.parse(await request.json())
    const salt = process.env.APP_AUTH_SALT || 'litx-private-owner'
    const [received, expected] = await Promise.all([accessToken(password, salt), accessToken(configured, salt)])
    if (!constantTimeEqual(received, expected)) {
      await new Promise(resolve => setTimeout(resolve, 350))
      return NextResponse.json({ success: false, error: 'Password non corretta' }, { status: 401 })
    }
    const response = NextResponse.json({ success: true })
    response.cookies.set('litx_owner', expected, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 14, priority: 'high' })
    return response
  } catch { return NextResponse.json({ success: false, error: 'Richiesta non valida' }, { status: 400 }) }
}

function constantTimeEqual(received: string, expected: string) {
  if (received.length !== expected.length) return false
  let different = 0
  for (let index = 0; index < received.length; index += 1) different |= received.charCodeAt(index) ^ expected.charCodeAt(index)
  return different === 0
}
