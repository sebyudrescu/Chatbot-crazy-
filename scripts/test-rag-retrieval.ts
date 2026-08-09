import assert from 'node:assert/strict'
import { rankBm25, tokenizeForRetrieval, tokenizeRetrievalQuery } from '../lib/bm25'
import { advancedRetrieve } from '../lib/advanced-rag'
import { rerankWithCrossEncoder } from '../lib/cross-encoder-reranker'
import { searchAuthorizedWeb } from '../lib/live-web-search'
import { benchmarkHtmlExtraction } from '../lib/html-extraction-benchmark'
import { averageRetrievalMetrics, calculateAnswerQualityMetrics, calculateRetrievalMetrics, calibrateRagThresholds } from '../lib/retrieval-metrics'
import { partitionEvaluationContextRelevance } from '../lib/evaluation-context-relevance'

const corpus = [
  { id: 'generic', text: 'Pantaloni pantaloni pantaloni e abbigliamento estivo per tutta la famiglia.' },
  { id: 'lord', text: 'Pantalone Lord uomo in lino nero, disponibile nelle taglie 46, 48, 50 e 52.' },
  { id: 'dress', text: 'Vestito donna lungo in viscosa color sabbia.' },
]

assert.deepEqual(tokenizeForRetrieval('Taglie: 46-52, LINO!'), ['taglie', '46', '52', 'lino'])
assert.ok(tokenizeRetrievalQuery('condizioni reso').includes('recesso'))
const ranked = rankBm25('pantalone uomo lino nero taglie', corpus, { topK: 3 })
assert.equal(ranked[0]?.document.id, 'lord')
assert.equal(ranked.every((result) => result.score > 0 && result.score <= 1), true)
const returnPolicy = rankBm25('Quali sono le condizioni per effettuare un reso?', [
  { id: 'generic-return', text: 'Per assistenza sui prodotti contatta il nostro team.' },
  { id: 'withdrawal', text: 'Diritto di recesso entro 14 giorni dalla ricezione del prodotto.' },
], { topK: 2 })
assert.equal(returnPolicy[0]?.document.id, 'withdrawal')

async function main() {
  const hybrid = await advancedRetrieve('pantalone uomo lino nero taglie', [], {
    topK: 2,
    keywordCandidates: corpus.map((document, index) => ({
      ...document,
      score: 0,
      metadata: { sourceId: document.id, sourceType: 'commerce', chunkIndex: index },
    })),
  })
  assert.equal(hybrid[0]?.id, 'lord')

const perfect = calculateRetrievalMetrics({ retrievedIds: ['lord', 'generic'], relevantIds: ['lord'] }, 2)
assert.equal(perfect.precisionAtK, 0.5)
assert.equal(perfect.recallAtK, 1)
assert.equal(perfect.hitAtK, 1)
assert.equal(perfect.reciprocalRank, 1)
assert.equal(perfect.ndcgAtK, 1)

const delayed = calculateRetrievalMetrics({ retrievedIds: ['generic', 'lord'], relevantIds: ['lord'] }, 2)
assert.equal(delayed.reciprocalRank, 0.5)
assert.ok(delayed.ndcgAtK > 0.6 && delayed.ndcgAtK < 0.7)
  const missed = calculateRetrievalMetrics({ retrievedIds: ['generic'], relevantIds: ['lord'] }, 1)
  assert.equal(missed.hitAtK, 0)
  const partitioned = partitionEvaluationContextRelevance({
    relevantContextIndexes: [0, 2, 2, 99],
    includesAuthoritativeBusinessContext: true,
    retrievalCandidateCount: 3,
  })
  assert.equal(partitioned.authoritativeBusinessContextRelevant, true)
  assert.deepEqual(partitioned.retrievalRelevantIndexes, [1])
  const average = averageRetrievalMetrics([perfect, delayed])
  assert.equal(average.reciprocalRank, 0.75)

  const quality = calculateAnswerQualityMetrics(
    'Il Pantalone Lord è disponibile nelle taglie 46, 48, 50 e 52.',
    [corpus[1].text],
    ['Lord', '46'],
  )
  assert.ok(quality.faithfulness > 0.7)
  assert.equal(quality.answerAccuracy, 1)

  const crossEncoder = await rerankWithCrossEncoder('pantalone uomo', [
    { id: 'generic', text: corpus[0].text, finalScore: 0.8 },
    { id: 'lord', text: corpus[1].text, finalScore: 0.5 },
  ], {
    enabled: true,
    apiKey: 'test',
    fetchImpl: async () => new Response(JSON.stringify({ model: 'test-reranker', results: [
      { index: 1, relevance_score: 0.98 },
      { index: 0, relevance_score: 0.2 },
    ] }), { status: 200 }),
  })
  assert.equal(crossEncoder.applied, true)
  assert.equal(crossEncoder.documents[0]?.id, 'lord')

  const crossEncoderFallback = await rerankWithCrossEncoder('pantalone uomo', [
    { id: 'generic', text: corpus[0].text, finalScore: 0.8 },
    { id: 'lord', text: corpus[1].text, finalScore: 0.5 },
  ], { enabled: true, apiKey: 'test', fetchImpl: async () => new Response('{}', { status: 503 }) })
  assert.equal(crossEncoderFallback.applied, false)
  assert.equal(crossEncoderFallback.documents[0]?.id, 'generic')

  const calibration = calibrateRagThresholds([
    { confidence: 0.9, retrievalScore: 0.8, passed: true },
    { confidence: 0.82, retrievalScore: 0.7, passed: true },
    { confidence: 0.35, retrievalScore: 0.2, passed: false },
    { confidence: 0.45, retrievalScore: 0.25, passed: false },
    { confidence: 0.75, retrievalScore: 0.6, passed: true },
  ])
  assert.equal(calibration.sampleCount, 5)
  assert.ok(calibration.groundingThreshold > 0.45)
  assert.ok(calibration.retrievalMinScore > 0.25)

  const webSearch = await searchAuthorizedWeb({
    query: 'resi',
    enabled: true,
    apiKey: 'test',
    allowedDomains: ['shop.example.com'],
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body || '{}'))
      assert.deepEqual(body.includeDomains, ['shop.example.com'])
      return new Response(JSON.stringify({ success: true, data: { web: [
        { title: 'Resi', url: 'https://shop.example.com/pages/returns', description: 'Reso entro 30 giorni.' },
        { title: 'Malevolo', url: 'https://evil.example/pages/returns', description: 'Dato non autorizzato.' },
      ] } }), { status: 200 })
    },
  })
  assert.equal(webSearch.results.length, 1)
  assert.equal(webSearch.results[0]?.domain, 'shop.example.com')

  const articleText = Array.from({ length: 12 }, (_, index) => `Paragrafo ${index + 1}. Il Pantalone Lord in lino nero è disponibile nelle taglie 46, 48, 50 e 52. Questa descrizione verificata spiega materiale, colore, vestibilità e disponibilità del prodotto.`).join(' ')
  const extractionRanking = await benchmarkHtmlExtraction({
    url: 'https://shop.example.com/products/lord',
    html: `<html><head><title>Pantalone Lord</title></head><body><nav>Menu Cookie Login Newsletter</nav><article><h1>Pantalone Lord</h1><p>${articleText}</p></article><footer>Copyright Newsletter</footer></body></html>`,
    expectedTerms: ['Pantalone Lord', 'lino nero', 'taglie'],
    firecrawl: { text: articleText, title: 'Pantalone Lord', durationMs: 10 },
    trafilatura: { text: articleText, title: 'Pantalone Lord', durationMs: 8 },
  })
  assert.equal(extractionRanking.length, 4)
  assert.ok(extractionRanking.every((result) => result.score >= 0 && result.score <= 1))
  assert.ok(extractionRanking[0].expectedTermCoverage === 1)

  console.log(JSON.stringify({
    success: true,
    checks: 35,
    topBm25Result: ranked[0]?.document.id,
    metrics: average,
  }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
