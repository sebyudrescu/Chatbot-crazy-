process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' })
require('ts-node/register/transpile-only')

const { appendAgentInstructions } = require('../lib/agent-instructions.ts')

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
]) assert(prompt.includes(expected), `Istruzione mancante nel prompt: ${expected}`)

assert(appendAgentInstructions('Base', {}) === 'Base', 'Una configurazione vuota non deve modificare il prompt')
console.log('Agent instruction tests: OK')
