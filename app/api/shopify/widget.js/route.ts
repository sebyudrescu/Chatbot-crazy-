import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeShopDomain } from '@/lib/shopify-signatures'

export async function GET(request: NextRequest) {
  const shop = normalizeShopDomain(request.nextUrl.searchParams.get('shop') || '')
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return NextResponse.json({ success: false, error: 'shop_not_valid' }, { status: 400 })
  }

  const connection = await prisma.integrationConnection.findFirst({
    where: { provider: 'shopify', externalAccountId: shop, enabled: true, status: 'connected' },
    select: {
      botId: true,
      chatbot: { select: { isActive: true, embedSettings: { select: { enabled: true } } } },
    },
  })

  if (!connection?.chatbot.isActive || !connection.chatbot.embedSettings?.enabled) {
    return NextResponse.json({ success: false, error: 'widget_not_published' }, { status: 404 })
  }

  const target = new URL('/api/embed/widget.js', request.nextUrl.origin)
  target.searchParams.set('botId', connection.botId)
  for (const key of ['placement', 'gap', 'edge', 'hideBackToTop'] as const) {
    const value = request.nextUrl.searchParams.get(key)
    if (value) target.searchParams.set(key, value)
  }
  return NextResponse.redirect(target, { status: 307, headers: { 'Cache-Control': 'private, no-store' } })
}
