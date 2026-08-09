import assert from 'node:assert/strict'
import { addGroundingCaution, evaluateGroundingPolicy, groundingFallbackMessage } from '../lib/grounding-policy'

const base = {
  requiresGrounding: true,
  confidence: 0.8,
  threshold: 0.7,
  knowledgeChunks: 1,
  persistentFacts: 0,
  graphEntities: 0,
}

assert.equal(evaluateGroundingPolicy({ ...base, requiresGrounding: false, knowledgeChunks: 0 }).action, 'allow')
assert.equal(evaluateGroundingPolicy({ ...base, knowledgeChunks: 0 }).reason, 'no_evidence')
assert.equal(evaluateGroundingPolicy({ ...base, confidence: 0.69 }).reason, 'below_threshold')
assert.equal(evaluateGroundingPolicy({ ...base, coherenceScore: 0.49 }).reason, 'low_coherence')
assert.equal(evaluateGroundingPolicy({ ...base, confidence: 0.72 }).action, 'caution')
assert.equal(evaluateGroundingPolicy({ ...base, confidence: 0.9 }).action, 'allow')
assert.equal(evaluateGroundingPolicy({ ...base, knowledgeChunks: 0, hasVerifiedCommerceContext: true }).reason, 'verified_commerce')
const authoritativeIdentity = evaluateGroundingPolicy({
  ...base,
  knowledgeChunks: 0,
  hasAuthoritativeBusinessContext: true,
})
assert.equal(authoritativeIdentity.action, 'allow')
assert.equal(authoritativeIdentity.reason, 'authoritative_business_context')
assert.equal(authoritativeIdentity.evidenceCount, 1)
assert.equal(evaluateGroundingPolicy({
  ...base,
  confidence: 0.69,
  knowledgeChunks: 0,
  hasAuthoritativeBusinessContext: true,
}).reason, 'below_threshold')
assert.match(groundingFallbackMessage(undefined, 'it'), /informazioni verificate/i)
assert.match(groundingFallbackMessage(undefined, 'en'), /verified information/i)
assert.equal(groundingFallbackMessage('  Messaggio proprietario  ', 'it'), 'Messaggio proprietario')
assert.match(addGroundingCaution('Risposta verificata', 'it'), /potrebbero essere parziali/i)

console.log(JSON.stringify({ success: true, checks: 15 }))
