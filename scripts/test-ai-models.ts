import assert from 'node:assert/strict'

import {
  AI_MODEL_CATALOG,
  DEFAULT_AGENTIC_MODEL,
  DEFAULT_CHAT_MODEL,
  isSupportedAIModel,
  normalizeAIModel,
  normalizeLegacyAIModel,
} from '../lib/ai-models'
import { estimateAIUsageCost } from '../lib/ai-pricing'

const catalogIds = AI_MODEL_CATALOG.map(model => model.id)

assert.equal(DEFAULT_CHAT_MODEL, 'gpt-4o-mini')
assert.equal(DEFAULT_AGENTIC_MODEL, 'gpt-5.6-terra')
assert.deepEqual(catalogIds.slice(0, 3), ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'])
assert.equal(new Set(catalogIds).size, catalogIds.length, 'Il catalogo non deve contenere duplicati')
assert.equal(AI_MODEL_CATALOG.filter(model => model.label.includes('Consigliato')).length, 1)

for (const model of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']) {
  assert.equal(isSupportedAIModel(model), true, `${model} deve essere selezionabile`)
  assert.ok(AI_MODEL_CATALOG.find(item => item.id === model)?.description)
}

assert.equal(normalizeAIModel('gpt-5.6'), 'gpt-5.6-sol')
assert.equal(normalizeAIModel('gpt-5.6-terra'), 'gpt-5.6-terra')
assert.equal(normalizeAIModel('modello-inesistente'), DEFAULT_CHAT_MODEL)
assert.equal(normalizeLegacyAIModel('gpt-5.6-luna'), 'gpt-4o-mini')
assert.equal(normalizeLegacyAIModel('gpt-5.6-terra'), 'gpt-4.1-mini')
assert.equal(normalizeLegacyAIModel('gpt-5.6-sol'), 'gpt-4.1')
assert.equal(normalizeLegacyAIModel('gpt-4o'), 'gpt-4o')

assert.equal(estimateAIUsageCost('gpt-5.6-luna', 100_000), 0.02)
assert.equal(estimateAIUsageCost('gpt-5.6-luna', 100_000, 0, 100_000), 0.002)
assert.equal(estimateAIUsageCost('gpt-5.6-terra', 100_000, 100_000), 1.4)
assert.equal(estimateAIUsageCost('gpt-5.6-sol', 100_000, 100_000), 3.5)
assert.equal(estimateAIUsageCost('gpt-5.6', 100_000, 100_000), 3.5)

// Official GPT-5.6 long-context pricing: >272K input doubles input and
// multiplies output by 1.5 for the full request.
assert.equal(estimateAIUsageCost('gpt-5.6-sol', 273_000, 1_000), 2.775)
assert.equal(estimateAIUsageCost('gpt-5.6-terra', 272_000, 1_000), 0.556)

assert.equal(estimateAIUsageCost('gpt-5.6-luna', 1_000, 0, 2_000), 0.00002)
assert.equal(estimateAIUsageCost('unknown-model', 1_000, 1_000), 0)

console.log(JSON.stringify({ success: true, catalogModels: catalogIds.length, pricingChecks: 8 }))
