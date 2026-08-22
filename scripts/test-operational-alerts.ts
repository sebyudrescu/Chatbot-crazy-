import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  errorRateAlert,
  jobSloAlert,
  modelFallbackAlert,
  operationalWindowKey,
  OPERATIONAL_MIN_EVENT_SAMPLE,
  OPERATIONAL_TOKEN_WARNING_MS,
  tokenExpiryAlert,
  summarizeOperationalJobs,
} from '../lib/operational-alert-policy'

assert.equal(errorRateAlert(OPERATIONAL_MIN_EVENT_SAMPLE - 1, 10), null)
assert.equal(errorRateAlert(100, 9), null)
assert.deepEqual(errorRateAlert(100, 10), { level: 'warning', rate: 0.1 })
assert.deepEqual(errorRateAlert(100, 20), { level: 'critical', rate: 0.2 })
assert.equal(modelFallbackAlert(100, 2), null)
assert.deepEqual(modelFallbackAlert(100, 3), { level: 'warning', rate: 0.03 })
assert.deepEqual(modelFallbackAlert(10, 5), { level: 'critical', rate: 0.5 })
assert.deepEqual(modelFallbackAlert(100, 10), { level: 'critical', rate: 0.1 })

const now = Date.UTC(2026, 7, 18, 12)
assert.equal(tokenExpiryAlert(undefined, now), null)
assert.equal(tokenExpiryAlert(new Date(now + OPERATIONAL_TOKEN_WARNING_MS + 1).toISOString(), now), null)
assert.equal(tokenExpiryAlert(new Date(now + OPERATIONAL_TOKEN_WARNING_MS).toISOString(), now)?.level, 'warning')
assert.equal(tokenExpiryAlert(new Date(now - 1).toISOString(), now)?.level, 'critical')
assert.equal(tokenExpiryAlert('not-a-date', now)?.level, 'critical')
assert.equal(operationalWindowKey('rate', 'bot', now), operationalWindowKey('rate', 'bot', now + 59_000))

const minute = 60_000
const jobs = [
  { status: 'completed', createdAt: new Date(now), startedAt: new Date(now + minute), completedAt: new Date(now + 3 * minute) },
  { status: 'completed', createdAt: new Date(now), startedAt: new Date(now + minute), completedAt: new Date(now + 4 * minute) },
  { status: 'completed', createdAt: new Date(now), startedAt: new Date(now + minute), completedAt: new Date(now + 5 * minute) },
  { status: 'completed', createdAt: new Date(now), startedAt: new Date(now + minute), completedAt: new Date(now + 6 * minute) },
  { status: 'failed', createdAt: new Date(now), startedAt: new Date(now + 3 * minute), completedAt: new Date(now + 8 * minute) },
]
const slo = summarizeOperationalJobs(jobs)
assert.deepEqual(slo, { sampleSize: 5, completed: 4, failed: 1, successRate: 0.8, p95DurationMs: 5 * minute, p95QueueWaitMs: 3 * minute })
assert.deepEqual(jobSloAlert(slo, { warningDurationMs: 10 * minute, criticalDurationMs: 20 * minute, warningQueueMs: 2 * minute, criticalQueueMs: 5 * minute }), { level: 'warning', reason: 'success_rate' })
assert.equal(jobSloAlert({ ...slo, sampleSize: 4 }, { warningDurationMs: minute, criticalDurationMs: 2 * minute, warningQueueMs: minute, criticalQueueMs: 2 * minute }), null)
const snapshotJob = summarizeOperationalJobs([{ status: 'completed', createdAt: new Date(now), startedAt: new Date(now + 9 * minute), runStartedAt: new Date(now + minute), completedAt: new Date(now + 4 * minute) }])
assert.equal(snapshotJob.p95DurationMs, 3 * minute)
assert.equal(snapshotJob.p95QueueWaitMs, minute)

const route = readFileSync(resolve(process.cwd(), 'app/api/notifications/route.ts'), 'utf8')
assert.match(route, /productSyncJob\.findMany/)
assert.match(route, /commerceWebhookDelivery\.findMany/)
assert.match(route, /tokenExpiryAlert/)
assert.match(route, /errorRateAlert/)
assert.match(route, /jobSloAlert/)
assert.match(route, /modelFallbackAlert/)
assert.match(route, /eventType: 'ai\.model\.fallback'/)
assert.match(route, /overdueRetries/)
assert.match(route, /redactOperationalText\(item\.errorMessage/)
assert.match(route, /Consulta le tracce operative per il dettaglio redatto/)
assert.doesNotMatch(route, /description: item\.errorMessage/)
assert.match(route, /severity: \{ in: \['error', 'critical'\] \}/)
assert.match(route, /status: 'running', startedAt: \{ lt: commerceStaleCutoff \}/)
assert.match(route, /status: 'failed', updatedAt: \{ gte: recentIncidentCutoff \}/)
assert.doesNotMatch(route, /accessTokenEncrypted.*description|refreshToken.*description|accessToken.*description/)

const orchestrator = readFileSync(resolve(process.cwd(), 'lib/agentic-orchestrator.ts'), 'utf8')
assert.match(orchestrator, /eventType: "ai\.model\.fallback"/)
assert.match(orchestrator, /reasonCategory: "availability"/)
assert.match(orchestrator, /sensitiveDetailsStored: false/)
assert.doesNotMatch(orchestrator, /ai\.model\.fallback[\s\S]{0,500}errorMessage/)

console.log(JSON.stringify({ success: true, checks: 35 }))
