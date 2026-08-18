import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  errorRateAlert,
  operationalWindowKey,
  OPERATIONAL_MIN_EVENT_SAMPLE,
  OPERATIONAL_TOKEN_WARNING_MS,
  tokenExpiryAlert,
} from '../lib/operational-alert-policy'

assert.equal(errorRateAlert(OPERATIONAL_MIN_EVENT_SAMPLE - 1, 10), null)
assert.equal(errorRateAlert(100, 9), null)
assert.deepEqual(errorRateAlert(100, 10), { level: 'warning', rate: 0.1 })
assert.deepEqual(errorRateAlert(100, 20), { level: 'critical', rate: 0.2 })

const now = Date.UTC(2026, 7, 18, 12)
assert.equal(tokenExpiryAlert(undefined, now), null)
assert.equal(tokenExpiryAlert(new Date(now + OPERATIONAL_TOKEN_WARNING_MS + 1).toISOString(), now), null)
assert.equal(tokenExpiryAlert(new Date(now + OPERATIONAL_TOKEN_WARNING_MS).toISOString(), now)?.level, 'warning')
assert.equal(tokenExpiryAlert(new Date(now - 1).toISOString(), now)?.level, 'critical')
assert.equal(tokenExpiryAlert('not-a-date', now)?.level, 'critical')
assert.equal(operationalWindowKey('rate', 'bot', now), operationalWindowKey('rate', 'bot', now + 59_000))

const route = readFileSync(resolve(process.cwd(), 'app/api/notifications/route.ts'), 'utf8')
assert.match(route, /productSyncJob\.findMany/)
assert.match(route, /commerceWebhookDelivery\.findMany/)
assert.match(route, /tokenExpiryAlert/)
assert.match(route, /errorRateAlert/)
assert.match(route, /redactOperationalText\(item\.errorMessage/)
assert.match(route, /severity: \{ in: \['error', 'critical'\] \}/)
assert.match(route, /status: 'running', startedAt: \{ lt: commerceStaleCutoff \}/)
assert.match(route, /status: 'failed', updatedAt: \{ gte: recentIncidentCutoff \}/)
assert.doesNotMatch(route, /accessTokenEncrypted.*description|refreshToken.*description|accessToken.*description/)

console.log(JSON.stringify({ success: true, checks: 17 }))
