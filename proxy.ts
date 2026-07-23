import { NextRequest, NextResponse } from 'next/server'
import { verifyOwnerSessionToken } from '@/lib/auth-token'

const publicPaths = ['/', '/login', '/connect/meta', '/api/chat', '/api/health', '/chatbot-widget.js']
const publicPrefixes = ['/api/auth/', '/api/embed/', '/api/cron/', '/api/meta/webhook/', '/api/meta/client/', '/api/meta/instagram/callback']

export async function proxy(request: NextRequest) {
  const password = process.env.APP_ACCESS_PASSWORD
  const isPublic = publicPaths.includes(request.nextUrl.pathname) || publicPrefixes.some(prefix => request.nextUrl.pathname.startsWith(prefix))
  if (isPublic) return withSecurityHeaders(NextResponse.next(), request)
  if (!password) {
    if (process.env.NODE_ENV !== 'production') return withSecurityHeaders(NextResponse.next(), request)
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return withSecurityHeaders(NextResponse.json({ success: false, error: 'Protezione proprietario non configurata' }, { status: 503 }), request)
    }
    return withSecurityHeaders(NextResponse.redirect(new URL('/login?configuration=missing', request.url)), request)
  }
  const authenticated = await verifyOwnerSessionToken(
    request.cookies.get('litx_owner')?.value,
    password,
    process.env.APP_AUTH_SALT || 'litx-private-owner',
  )
  if (authenticated) return withSecurityHeaders(NextResponse.next(), request)
  if (request.nextUrl.pathname.startsWith('/api/')) return withSecurityHeaders(NextResponse.json({ success: false, error: 'Accesso non autorizzato' }, { status: 401 }), request)
  const login = new URL('/login', request.url)
  login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return withSecurityHeaders(NextResponse.redirect(login), request)
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] }

function withSecurityHeaders(response: NextResponse, request: NextRequest) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('X-Frame-Options', 'DENY')
  const widgetApi = request.nextUrl.pathname === '/api/chat'
    || request.nextUrl.pathname.startsWith('/api/embed/')
  const origin = request.headers.get('origin')
  if (widgetApi && origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-LitX-Widget-Session')
    response.headers.set('Vary', 'Origin')
  }
  return response
}
