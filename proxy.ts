import { NextRequest, NextResponse } from 'next/server'
import { verifyOwnerSessionToken } from '@/lib/auth-token'
import { httpSecurityHeaders } from '@/lib/http-security'

const publicPaths = ['/', '/login', '/accept-invite', '/connect/meta', '/api/chat', '/api/health', '/api/internal/observability', '/api/internal/commerce-sync', '/api/shopify/widget.js', '/chatbot-widget.js']
const publicPrefixes = ['/agent/', '/api/auth/', '/api/embed/', '/api/v1/', '/api/cron/', '/api/meta/webhook/', '/api/meta/client/', '/api/meta/instagram/callback', '/api/shopify/oauth/callback', '/api/shopify/webhooks', '/api/woocommerce/oauth/callback', '/api/woocommerce/oauth/return', '/api/woocommerce/webhooks', '/api/commerce/conversions', '/api/commerce/click']

function isTenantReadyApi(request: NextRequest) {
  const path = request.nextUrl.pathname
  const knowledgeMutationRoutes = new Set([
    '/api/knowledge-sources/add-url',
    '/api/knowledge-sources/crawl-site',
    '/api/knowledge-sources/crawl-with-progress',
    '/api/knowledge-sources/manual',
    '/api/knowledge-sources/upload-document',
    '/api/knowledge-sources/upload-pdf',
    '/api/ingestion/add-url',
    '/api/ingestion/cancel',
    '/api/ingestion/crawl',
    '/api/ingestion/retry',
    '/api/ingestion/upload-pdf',
  ])
  if (knowledgeMutationRoutes.has(path)) return request.method === 'POST'
  if (path === '/api/knowledge-sources/sync') return request.method === 'GET' || request.method === 'POST'
  if (path === '/api/ingestion/status') return request.method === 'GET'
  if (path === '/api/evaluations/calibrate' || path === '/api/evaluations/judge' || path === '/api/evaluations/runs') return request.method === 'POST'
  if (path === '/api/conversations/export' || path === '/api/contacts/export') return request.method === 'GET'
  if (path === '/api/ai-usage' || path === '/api/search') return request.method === 'GET'
  if (path === '/api/commerce/sync') return request.method === 'GET' || request.method === 'POST'
  if (path === '/api/commerce/tracking-key') return request.method === 'GET' || request.method === 'POST'
  if (path === '/api/api-keys') return request.method === 'GET' || request.method === 'POST'
  if (path === '/api/messages') return request.method === 'POST'
  if (path === '/api/suggestions') return request.method === 'GET'
  if (/^\/api\/api-keys\/[0-9a-f-]{36}$/i.test(path)) return request.method === 'DELETE'
  if (/^\/api\/messages\/[0-9a-f-]{36}\/revisions$/i.test(path)) return request.method === 'GET' || request.method === 'POST'
  if (/^\/api\/suggestions\/[0-9a-f-]{36}$/i.test(path)) return request.method === 'PATCH'
  if (/^\/api\/suggestions\/[0-9a-f-]{36}\/apply$/i.test(path)) return request.method === 'POST'
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
  if (/^\/api\/(actions|workflows|evaluations|integrations|contacts|commerce|conversations)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path)) {
    return request.method === 'GET' || request.method === 'PATCH' || request.method === 'DELETE'
  }
  if (/^\/api\/actions\/[0-9a-f-]{36}\/simulate$/i.test(path)) return request.method === 'POST'
  if (/^\/api\/actions\/[0-9a-f-]{36}\/widget-functions\/[0-9a-f-]{36}$/i.test(path)) return request.method === 'POST'
  if (/^\/api\/actions\/[0-9a-f-]{36}\/widget-versions$/i.test(path)) return request.method === 'GET'
  if (/^\/api\/actions\/[0-9a-f-]{36}\/widget-versions\/\d+\/restore$/i.test(path)) return request.method === 'POST'
  if (/^\/api\/workflows\/[0-9a-f-]{36}\/simulate$/i.test(path)) return request.method === 'POST'
  if (/^\/api\/integrations\/[0-9a-f-]{36}\/(deliveries|test)$/i.test(path)) return request.method === (path.endsWith('/test') ? 'POST' : 'GET')
  if (/^\/api\/conversations\/[0-9a-f-]{36}\/(assist|escalate|trace)$/i.test(path)) {
    if (path.endsWith('/trace')) return request.method === 'GET'
    if (path.endsWith('/assist')) return request.method === 'POST'
    return request.method === 'POST' || request.method === 'DELETE'
  }
  if (/^\/api\/workspaces\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/invitations$/i.test(path)) {
    return request.method === 'GET' || request.method === 'POST'
  }
  if (path === '/api/chatbots') return request.method === 'GET' || request.method === 'POST'
  if (/^\/api\/chatbots\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/clone$/i.test(path)) {
    return request.method === 'POST'
  }
  if (/^\/api\/chatbots\/[0-9a-f-]{36}\/(embed|export|prompt-versions|readiness)$/i.test(path)) {
    if (path.endsWith('/embed')) return request.method === 'GET' || request.method === 'PUT'
    return request.method === 'GET'
  }
  if (/^\/api\/chatbots\/[0-9a-f-]{36}\/prompt-versions\/[0-9a-f-]{36}\/restore$/i.test(path)) return request.method === 'POST'
  return /^\/api\/chatbots\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path)
    && (request.method === 'GET' || request.method === 'PATCH' || request.method === 'DELETE')
}

export async function proxy(request: NextRequest) {
  const password = process.env.APP_ACCESS_PASSWORD
  const isPublic = publicPaths.includes(request.nextUrl.pathname) || publicPrefixes.some(prefix => request.nextUrl.pathname.startsWith(prefix))
  if (isPublic) return withSecurityHeaders(NextResponse.next(), request)
  const userSession = request.cookies.get('litx_user_session')?.value
  if (request.nextUrl.pathname === '/portal' && userSession && /^[A-Za-z0-9_-]{43,128}$/.test(userSession)) {
    return withSecurityHeaders(NextResponse.next(), request)
  }
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
