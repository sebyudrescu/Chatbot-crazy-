import { normalizeShopDomain } from './shopify-signatures'

export const SHOPIFY_WIDGET_HANDLE = 'litx-chat-widget'

export function shopifyThemeEditorUrl(
  shopDomain: string | null | undefined,
  clientId: string | null | undefined,
) {
  const shop = normalizeShopDomain(shopDomain || '')
  const apiKey = (clientId || '').trim()
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) || !/^[a-f0-9]{16,64}$/i.test(apiKey)) return null
  const url = new URL(`https://${shop}/admin/themes/current/editor`)
  url.searchParams.set('context', 'apps')
  url.searchParams.set('activateAppId', `${apiKey}/${SHOPIFY_WIDGET_HANDLE}`)
  return url.toString()
}
