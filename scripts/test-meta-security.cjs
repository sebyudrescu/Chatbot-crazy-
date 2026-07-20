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

const { encryptMetaToken, decryptMetaToken, verifyMetaSignature } = require('../lib/meta-security.ts')
const { createMetaOAuthState, readMetaOAuthState } = require('../lib/meta-oauth-state.ts')

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

const state = createMetaOAuthState('3f47da9f-b8c8-4b35-b25b-bd6425af18fb', 'instagram', 1_000)
assert(readMetaOAuthState(state, 2_000).provider === 'instagram', 'Stato OAuth valido rifiutato')
let expiredRejected = false
try { readMetaOAuthState(state, 700_000) } catch { expiredRejected = true }
assert(expiredRejected, 'Stato OAuth scaduto accettato')

console.log('Meta security tests: OK')
