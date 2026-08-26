import { NextRequest, NextResponse } from 'next/server'
import { verifyOwnerSessionToken } from '@/lib/auth-token'
import { httpSecurityHeaders } from '@/lib/http-security'

const publicPaths = ['/', '/login', '/connect/meta', '/api/chat', '/api/health', '/api/internal/observability', '/api/internal/commerce-sync', '/api/shopify/widget.js', '/chatbot-widget.js']
const publicPrefixes = ['/agent/', '/api/auth/', '/api/embed/', '/api/v1/', '/api/cron/', '/api/meta/webhook/', '/api/meta/client/', '/api/meta/instagram/callback', '/api/shopify/oauth/callback', '/api/shopify/webhooks', '/api/woocommerce/oauth/callback', '/api/woocommerce/oauth/return', '/api/woocommerce/webhooks', '/api/commerce/conversions', '/api/commerce/click']

function isTenantReadyApi(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (path === '/api/analytics') return request.method === 'GET'
  if (path === '/api/conversations') return request.method === 'GET'
  if (path === '/api/chatbots/import') return request.method === 'POST'
  if (path === '/api/templates/instantiate') return request.method === 'POST'
  if (path === '/api/workspaces') return request.method === 'GET' || request.method === 'POST'
  if (path === '/api/actions') return request.method === 'GET' || request.method === 'POST'
  if (path === '/api/workflows') return request.method === 'GET' || request.method === 'POST'
  if (path === '/api/evaluations') return request.method === 'GET' || request.method === 'POST'
  if (path === '/api/integrations') return request.method === 'GET' || request.method === 'POST'
  if (path === '/api/contacts') return request.method === 'GET'
  if (path === '/api/commerce') return request.method === 'GET'
  if (path === '/api/knowledge-sources') return request.method === 'GET' || request.method === 'POST' || request.method === 'DELETE'
  if (/^\/api\/workspaces\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/invitations$/i.test(path)) {
    return request.method === 'GET' || request.method === 'POST'
  }
  if (path === '/api/chatbots') return request.method === 'GET' || request.method === 'POST'
  if (/^\/api\/chatbots\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/clone$/i.test(path)) {
    return request.method === 'POST'
  }
  return /^\/api\/chatbots\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path)
    && (request.method === 'GET' || request.method === 'PATCH' || request.method === 'DELETE')
}

export async function proxy(request: NextRequest) {
  const password = process.env.APP_ACCESS_PASSWORD
  const isPublic = publicPaths.includes(request.nextUrl.pathname) || publicPrefixes.some(prefix => request.nextUrl.pathname.startsWith(prefix))
  if (isPublic) return withSecurityHeaders(NextResponse.next(), request)
  const userSession = request.cookies.get('litx_user_session')?.value
  if (isTenantReadyApi(request) && userSession && /^[A-Za-z0-9_-]{43,128}$/.test(userSession)) {
    return withSecurityHeaders(NextResponse.next(), request)
  }
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

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] }

function withSecurityHeaders(response: NextResponse, request: NextRequest) {
  for (const [key, value] of Object.entries(httpSecurityHeaders())) response.headers.set(key, value)
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
