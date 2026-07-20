process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' })
require('ts-node/register/transpile-only')

const { appendAgentInstructions } = require('../lib/agent-instructions.ts')
const { enforceOutgoingPolicy, evaluateIncomingPolicy, policyResponse } = require('../lib/agent-policy.ts')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const prompt = appendAgentInstructions('Sei un assistente.', {
  role: 'Consulente commerciale',
  objective: 'Qualificare richieste reali',
  personality: 'Calmo e trasparente',
  forbiddenTopics: ['Diagnosi mediche'],
  forbiddenResponses: ['Promesse di risultato garantito'],
  handoffTriggers: ['Il cliente chiede un operatore'],
  leadCollectionFields: ['Nome', 'Email', 'Consenso privacy'],
  language: 'Italiano',
  responseLength: 'short',
  fallbackMessage: 'Non ho informazioni sufficienti.',
  handoffMessage: 'Ti passo subito a un operatore.',
})

for (const expected of [
  'Personalità: Calmo e trasparente',
  'Argomenti vietati',
  'Diagnosi mediche',
  'Risposte vietate',
  'Promesse di risultato garantito',
  'Passa a un operatore umano',
  'Il cliente chiede un operatore',
  'Nome, Email, Consenso privacy',
  'Ti passo subito a un operatore.',
]) assert(prompt.includes(expected), `Istruzione mancante nel prompt: ${expected}`)

assert(appendAgentInstructions('Base', {}) === 'Base', 'Una configurazione vuota non deve modificare il prompt')

const policySettings = {
  forbiddenTopics: ['diagnosi mediche'],
  forbiddenResponses: ['risultato garantito'],
  handoffTriggers: ['cliente molto insoddisfatto'],
  fallbackMessage: 'Richiesta non gestibile.',
  handoffMessage: 'Ti passo subito a un operatore.',
}
const handoff = evaluateIncomingPolicy('Sono davvero molto insoddisfatto del servizio', policySettings)
assert(handoff.action === 'handoff' && handoff.matchedRule === 'cliente molto insoddisfatto', 'Il trigger handoff non è stato rilevato')
assert(policyResponse(handoff, policySettings) === policySettings.handoffMessage, 'Il messaggio handoff configurato non viene usato')
assert(evaluateIncomingPolicy('Puoi farmi una diagnosi medica?', policySettings).action === 'fallback', 'Un argomento vietato non è stato bloccato')
assert(enforceOutgoingPolicy('Ti prometto un risultato garantito.', policySettings).action === 'fallback', 'Una risposta vietata non è stata bloccata')
assert(evaluateIncomingPolicy('Vorrei conoscere i vostri orari', policySettings).action === 'allow', 'Una richiesta lecita è stata bloccata')
console.log('Agent instruction tests: OK')
