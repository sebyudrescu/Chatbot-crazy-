const Module = require('node:module')

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, parent, isMain)
}

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' })
require('ts-node/register/transpile-only')

const {
  createOwnerSessionToken,
  OWNER_SESSION_MAX_AGE_SECONDS,
  verifyOwnerSessionToken,
} = require('../lib/auth-token.ts')

async function main() {
  const password = 'owner-session-test-password'
  const salt = 'owner-session-test-salt-with-enough-entropy'
  const issuedAt = 1_800_000_000_000
  const token = await createOwnerSessionToken(password, salt, issuedAt)

  if (!(await verifyOwnerSessionToken(token, password, salt, issuedAt + 1_000))) {
    throw new Error('A valid owner session was rejected')
  }
  if (await verifyOwnerSessionToken(token, `${password}-wrong`, salt, issuedAt + 1_000)) {
    throw new Error('A session signed with another password was accepted')
  }
  const tampered = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`
  if (await verifyOwnerSessionToken(tampered, password, salt, issuedAt + 1_000)) {
    throw new Error('A tampered owner session was accepted')
  }
  const expiredAt = issuedAt + OWNER_SESSION_MAX_AGE_SECONDS * 1000 + 1
  if (await verifyOwnerSessionToken(token, password, salt, expiredAt)) {
    throw new Error('An expired owner session was accepted')
  }

  console.log('Owner session security tests: OK')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
