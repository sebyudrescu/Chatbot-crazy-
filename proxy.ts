import { NextRequest, NextResponse } from 'next/server'
import { accessToken } from '@/lib/auth-token'

const publicPaths = ['/', '/login', '/api/chat', '/api/health']
const publicPrefixes = ['/api/auth/', '/api/embed/']

export async function proxy(request: NextRequest) {
  const password = process.env.APP_ACCESS_PASSWORD
  const isPublic = publicPaths.includes(request.nextUrl.pathname) || publicPrefixes.some(prefix => request.nextUrl.pathname.startsWith(prefix))
  if (isPublic) return withSecurityHeaders(NextResponse.next())
  if (!password) {
    if (process.env.NODE_ENV !== 'production') return withSecurityHeaders(NextResponse.next())
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return withSecurityHeaders(NextResponse.json({ success: false, error: 'Protezione proprietario non configurata' }, { status: 503 }))
    }
    return withSecurityHeaders(NextResponse.redirect(new URL('/login?configuration=missing', request.url)))
  }
  const expected = await accessToken(password, process.env.APP_AUTH_SALT || 'litx-private-owner')
  if (request.cookies.get('litx_owner')?.value === expected) return withSecurityHeaders(NextResponse.next())
  if (request.nextUrl.pathname.startsWith('/api/')) return withSecurityHeaders(NextResponse.json({ success: false, error: 'Accesso non autorizzato' }, { status: 401 }))
  const login = new URL('/login', request.url)
  login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return withSecurityHeaders(NextResponse.redirect(login))
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] }

function withSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('X-Frame-Options', 'DENY')
  return response
}
