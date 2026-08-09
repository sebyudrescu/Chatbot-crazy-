import assert from 'node:assert/strict'
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
console.log('Shopify widget onboarding tests passed')
