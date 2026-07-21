const Module = require('node:module')

let memoryRows = []
let duplicateRow = null
let lastFindManyArgs = null
let lastUpdateArgs = null
const fakePrisma = {
  structuredFact: {
    findMany: async args => { lastFindManyArgs = args; return memoryRows },
    findFirst: async () => duplicateRow,
    update: async args => {
      lastUpdateArgs = args
      return { ...duplicateRow, ...args.data }
    },
    create: async () => { throw new Error('Un duplicato non deve creare un nuovo fatto') },
    updateMany: async () => ({ count: 0 }),
  },
}

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === './db' && parent?.filename?.endsWith('structured-memory.ts')) return { prisma: fakePrisma }
  if (request === './embeddings' && parent?.filename?.endsWith('structured-memory.ts')) return { generateEmbedding: async () => [1, 0] }
  return originalLoad.call(this, request, parent, isMain)
}
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' })
require('ts-node/register/transpile-only')

const { planRetrieval } = require('../lib/multi-dimensional-retrieval.ts')
const { queryMemory, storeFact } = require('../lib/structured-memory.ts')
const { hasUserEvidence } = require('../lib/fact-evidence.ts')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function context(overrides = {}) {
  return {
    query: 'Quanto costa il servizio?',
    intent: 'question',
    entities: [],
    topics: [],
    conversationLength: 1,
    recentMessages: [],
    ...overrides,
  }
}

const preference = planRetrieval(context({
  query: 'Ti ricordi cosa preferisco?',
  conversationLength: 5,
  recentMessages: [
    { role: 'user', content: 'Preferisco il piano annuale' },
    { role: 'assistant', content: 'Va bene' },
  ],
}))
assert(preference.usePersistentMemory && !preference.useKnowledgeBase, 'Le domande sulla memoria utente devono usare i fatti persistenti')
assert(preference.relevantFactTypes.includes('preference'), 'Il filtro preference non è stato applicato')
assert(preference.relevantFactTypes.includes('profile'), 'Il filtro profile non è stato applicato')
assert(preference.relevantCategories.length === 0, 'I tipi di fatto sono stati confusi con le categorie')

const followUp = planRetrieval(context({
  query: 'E quello?',
  conversationLength: 4,
  recentMessages: [
    { role: 'user', content: 'Parlami del piano annuale' },
    { role: 'assistant', content: 'Il piano annuale include assistenza' },
  ],
}))
assert(followUp.usePersistentMemory && followUp.contextWeight > 0, 'Il follow-up deve combinare memoria e contesto')
assert(followUp.relevantCategories.length === 0, 'Un follow-up non deve scartare fatti di altre categorie')

const complaint = planRetrieval(context({ query: 'Il servizio non funziona', intent: 'complaint' }))
assert(complaint.relevantFactTypes.includes('complaint'), 'Le lamentele devono recuperare problemi precedenti')
assert(complaint.relevantCategories.every(category => ['support', 'service'].includes(category)), 'Filtro categoria complaint non valido')

const greeting = planRetrieval(context({ query: 'Ciao', intent: 'greeting' }))
assert(greeting.useContextOnly && !greeting.usePersistentMemory && !greeting.useKnowledgeBase, 'Un saluto non deve interrogare memoria o knowledge base')

const factual = planRetrieval(context())
assert(factual.useKnowledgeBase && !factual.usePersistentMemory, 'Una domanda fattuale generale deve usare la knowledge base')

const evidenceMessages = [
  { role: 'user', content: 'Preferisco il piano annuale, grazie.' },
  { role: 'assistant', content: 'Il cliente vive a Milano.' },
]
assert(hasUserEvidence({ rawText: 'Preferisco il piano annuale' }, evidenceMessages), 'Una citazione utente valida è stata rifiutata')
assert(!hasUserEvidence({ rawText: 'Il cliente vive a Milano' }, evidenceMessages), 'Una frase detta soltanto dall’assistente è stata memorizzata')

async function runPersistenceChecks() {
  const baseFact = {
    conversationId: 'conversation-1',
    botId: 'bot-1',
    factType: 'preference',
    category: 'general',
    entityType: null,
    entityName: null,
    attribute: null,
    confidence: 0.9,
    source: 'user_stated',
    extractedAt: new Date('2026-07-21T12:00:00.000Z'),
    validFrom: new Date('2026-07-21T12:00:00.000Z'),
    validUntil: null,
    isActive: true,
    supersedes: null,
    supersededBy: null,
    embeddingModel: null,
    intent: null,
    sentiment: null,
    importance: 8,
    rawText: null,
    extractionMethod: 'test',
    metadata: null,
  }
  memoryRows = [
    { ...baseFact, id: 'fact-embedded', value: 'Preferisce il piano annuale', embedding: JSON.stringify([1, 0]) },
    { ...baseFact, id: 'fact-without-embedding', value: 'Non vuole telefonate al mattino', embedding: null },
  ]
  const recalled = await queryMemory({
    conversationId: 'conversation-1',
    botId: 'bot-1',
    query: 'Cosa preferisce?',
    factTypes: ['preference'],
    topK: 5,
    useSemanticSearch: true,
  })
  assert(lastFindManyArgs.where.factType.in[0] === 'preference', 'Il filtro tipo non è arrivato al database')
  assert(recalled.length === 2, 'Il reranking ha eliminato un fatto privo di embedding')
  assert(recalled.some(fact => fact.id === 'fact-without-embedding'), 'Il fatto senza embedding non è stato conservato')

  duplicateRow = memoryRows[0]
  await storeFact({
    conversationId: 'conversation-1',
    botId: 'bot-1',
    factType: 'preference',
    category: 'general',
    value: '  Preferisce il piano annuale  ',
    confidence: 0.95,
    source: 'user_stated',
    importance: 9,
  })
  assert(lastUpdateArgs.where.id === 'fact-embedded', 'Il fatto duplicato non è stato aggiornato')
  assert(lastUpdateArgs.data.importance === 9, 'Il duplicato non ha conservato l’importanza maggiore')
}

runPersistenceChecks()
  .then(() => console.log('Memory retrieval tests: OK'))
  .catch(error => { console.error(error); process.exit(1) })
