const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, parent, isMain)
}

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' })
require('ts-node/register/transpile-only')

const { hashUserPassword, verifyUserPassword } = require('../lib/password-hash.ts')
const { createInvitationToken, invitationTokenHash, isInvitationToken } = require('../lib/invitation-token.ts')

async function main() {
  const password = 'Una-password-di-test-2026!'
  const encoded = await hashUserPassword(password)
  assert.notEqual(encoded, password)
  assert.match(encoded, /^litx\$scrypt\$v1\$/)
  assert.equal(await verifyUserPassword(password, encoded), true)
  assert.equal(await verifyUserPassword('password-sbagliata', encoded), false)
  assert.equal(await verifyUserPassword(password, 'valore-malformato'), false)

  const tokenA = createInvitationToken()
  const tokenB = createInvitationToken()
  assert.equal(isInvitationToken(tokenA), true)
  assert.equal(isInvitationToken('corto'), false)
  assert.notEqual(tokenA, tokenB)
  assert.equal(invitationTokenHash(tokenA), invitationTokenHash(tokenA))
  assert.notEqual(invitationTokenHash(tokenA), invitationTokenHash(tokenB))

  const root = path.resolve(__dirname, '..')
  const login = fs.readFileSync(path.join(root, 'app/api/auth/login/route.ts'), 'utf8')
  const logout = fs.readFileSync(path.join(root, 'app/api/auth/logout/route.ts'), 'utf8')
  const invitations = fs.readFileSync(path.join(root, 'app/api/workspaces/[id]/invitations/route.ts'), 'utf8')
  const accept = fs.readFileSync(path.join(root, 'app/api/auth/invitations/[token]/route.ts'), 'utf8')
  assert.match(login, /verifyUserPassword/)
  assert.match(login, /checkRateLimit/)
  assert.match(login, /issueUserSession/)
  assert.match(logout, /revokeUserSession/)
  assert.match(invitations, /members\.manage/)
  assert.match(invitations, /tokenHash: invitationTokenHash\(token\)/)
  assert.doesNotMatch(invitations, /select:\s*\{[^}]*tokenHash:/s)
  assert.match(accept, /workspaceMembership\.upsert/)
  assert.match(accept, /acceptedAt: null/)
  assert.match(accept, /USER_SESSION_COOKIE/)
  assert.match(accept, /checkRateLimit/)

  console.log('Client authentication: 21 controlli superati')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
