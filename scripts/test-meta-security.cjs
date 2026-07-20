const Module = require('node:module')
const { createHmac, randomBytes } = require('node:crypto')

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, parent, isMain)
}
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' })
require('ts-node/register/transpile-only')

process.env.META_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')
process.env.META_APP_SECRET = 'meta-test-secret-that-is-long-enough'
process.env.META_INSTAGRAM_APP_SECRET = 'instagram-test-secret-that-is-long-enough'

const { encryptMetaToken, decryptMetaToken, verifyMetaSignature } = require('../lib/meta-security.ts')
const { createMetaOAuthState, readMetaOAuthState } = require('../lib/meta-oauth-state.ts')
const { getMetaSetupReport, metaReadiness } = require('../lib/meta-config.ts')

function assert(condition, message) { if (!condition) throw new Error(message) }

const encrypted = encryptMetaToken('access-token-value')
assert(encrypted !== 'access-token-value', 'Il token non deve restare in chiaro')
assert(decryptMetaToken(encrypted) === 'access-token-value', 'Roundtrip cifratura fallito')
let tamperRejected = false
try { decryptMetaToken(`${encrypted.slice(0, -1)}x`) } catch { tamperRejected = true }
assert(tamperRejected, 'Un token alterato deve essere rifiutato')

const raw = JSON.stringify({ object: 'whatsapp_business_account' })
const signature = `sha256=${createHmac('sha256', process.env.META_APP_SECRET).update(raw).digest('hex')}`
assert(verifyMetaSignature(raw, signature), 'Firma webhook valida rifiutata')
assert(!verifyMetaSignature(`${raw}x`, signature), 'Payload alterato accettato')
const instagramSignature = `sha256=${createHmac('sha256', process.env.META_INSTAGRAM_APP_SECRET).update(raw).digest('hex')}`
assert(verifyMetaSignature(raw, instagramSignature), 'Firma webhook Instagram valida rifiutata')

const state = createMetaOAuthState('3f47da9f-b8c8-4b35-b25b-bd6425af18fb', 'instagram', 1_000)
assert(readMetaOAuthState(state, 2_000).provider === 'instagram', 'Stato OAuth valido rifiutato')
const previousInstagramSecret = process.env.META_INSTAGRAM_APP_SECRET
process.env.META_INSTAGRAM_APP_SECRET = 'instagram-secret-changed-after-state-creation'
let wrongProviderSecretRejected = false
try { readMetaOAuthState(state, 2_000) } catch { wrongProviderSecretRejected = true }
assert(wrongProviderSecretRejected, 'Stato OAuth Instagram firmato con un segreto diverso accettato')
process.env.META_INSTAGRAM_APP_SECRET = previousInstagramSecret
let expiredRejected = false
try { readMetaOAuthState(state, 700_000) } catch { expiredRejected = true }
assert(expiredRejected, 'Stato OAuth scaduto accettato')

const completeMetaEnv = {
  NEXT_PUBLIC_APP_URL: 'https://agents.example.com',
  META_GRAPH_API_VERSION: 'v24.0',
  META_VERIFY_TOKEN: 'verify-token-that-is-at-least-32-characters',
  META_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  META_APP_ID: '123456789012345',
  META_APP_SECRET: 'meta-app-secret-that-is-long-enough',
  META_WHATSAPP_CONFIG_ID: '987654321098765',
}
const whatsappSetup = getMetaSetupReport('whatsapp', completeMetaEnv)
assert(whatsappSetup.ready, `Setup WhatsApp completo rifiutato: ${whatsappSetup.missing.join(', ')}`)
assert(metaReadiness('whatsapp', completeMetaEnv), 'Readiness WhatsApp non coerente con il report')

const missingConfig = getMetaSetupReport('whatsapp', { ...completeMetaEnv, META_WHATSAPP_CONFIG_ID: '' })
assert(!missingConfig.ready && missingConfig.missing.includes('META_WHATSAPP_CONFIG_ID'), 'Config ID WhatsApp mancante non rilevato')

const insecureEncryption = getMetaSetupReport('whatsapp', { ...completeMetaEnv, META_TOKEN_ENCRYPTION_KEY: 'too-short' })
assert(!insecureEncryption.ready && insecureEncryption.missing.includes('META_TOKEN_ENCRYPTION_KEY'), 'Chiave di cifratura Meta non valida accettata')

const localUrl = getMetaSetupReport('instagram', { ...completeMetaEnv, NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
assert(!localUrl.ready && localUrl.missing.includes('NEXT_PUBLIC_APP_URL'), 'URL locale accettato per i webhook Meta')

console.log('Meta security tests: OK')
