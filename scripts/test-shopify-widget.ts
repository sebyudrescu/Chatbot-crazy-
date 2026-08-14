import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { shopifyThemeEditorUrl } from '../lib/shopify-widget'

const url = shopifyThemeEditorUrl('demo-store.myshopify.com', '92af677613cc889443a398db8f937611')
assert.ok(url)
const parsed = new URL(url)
assert.equal(parsed.hostname, 'demo-store.myshopify.com')
assert.equal(parsed.pathname, '/admin/themes/current/editor')
assert.equal(parsed.searchParams.get('context'), 'apps')
assert.equal(parsed.searchParams.get('activateAppId'), '92af677613cc889443a398db8f937611/litx-chat-widget')
assert.equal(shopifyThemeEditorUrl('evil.example.com', '92af677613cc889443a398db8f937611'), null)
assert.equal(shopifyThemeEditorUrl('demo-store.myshopify.com', 'not-a-client-id'), null)
const proxySource = fs.readFileSync(path.join(process.cwd(), 'proxy.ts'), 'utf8')
assert.match(proxySource, /publicPaths[^\n]+['"]\/api\/shopify\/widget\.js['"]/, 'the storefront loader must bypass owner login')
assert.doesNotMatch(proxySource, /publicPrefixes[^\n]+['"]\/api\/shopify\/['"]/, 'Shopify admin APIs must not become public as a group')
const widgetRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/embed/widget.js/route.ts'), 'utf8')
const storefrontLoader = fs.readFileSync(path.join(process.cwd(), 'shopify/extensions/litx-chat-widget/assets/litx-loader.js'), 'utf8')
assert.match(storefrontLoader, /searchParams\.set\('v', '\d{8}-\d+'\)/, 'the Shopify loader must version the remote widget URL so phones do not keep stale positioning CSS')
assert.match(storefrontLoader, /DOMContentLoaded/, 'the async Shopify asset must wait until its body app-embed context exists')
assert.match(storefrontLoader, /function bootLitxWidget/, 'the Shopify loader must use an idempotent DOM-ready bootstrap')
assert.match(storefrontLoader, /mountImmediateLauncher\(layout\)/, 'the Shopify asset must paint a launcher before the remote configuration round trip completes')
assert.match(storefrontLoader, /__litxOpenOnReady/, 'an early launcher click must be honored when the full widget is ready')
assert.match(storefrontLoader, /searchParams\.set\('placement'/, 'Theme Editor placement must travel with the remote widget request')
assert.match(widgetRoute, /shopifyLayout:/, 'the server-rendered widget config must contain Shopify layout settings')
assert.match(widgetRoute, /Cache-Control['"]:\s*['"]private, no-store['"]/, 'domain decisions must never be shared through a public CDN cache')
assert.match(widgetRoute, /Vary['"]:\s*['"]Origin, Referer['"]/, 'widget script responses must vary by storefront origin')
console.log('Shopify widget onboarding tests passed')
