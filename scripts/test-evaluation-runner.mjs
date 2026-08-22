import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { conversationQualityRequest, evaluationMessages } from './evaluation-runner-contract.mjs'

assert.deepEqual(evaluationMessages({
  conversationTurns: ['Cerco una camicia da donna', 'Elegante e nera'],
  question: 'Quale mi consigli?',
}), ['Cerco una camicia da donna', 'Elegante e nera', 'Quale mi consigli?'])

assert.deepEqual(conversationQualityRequest({ qualityContract: { cardPolicy: 'required' } }, {
  intent: { type: 'product_discovery' },
  evaluationTrace: {
    tools: [
      { name: 'search_products', success: true },
      { name: 'search_knowledge_base', success: false },
    ],
    rememberedSlots: { gender: 'women', category: 'shirt' },
  },
  productCards: [{ productId: 'shirt-woman' }],
}), {
  conversationQuality: {
    contract: { cardPolicy: 'required' },
    observation: {
      intent: 'product_discovery',
      tools: ['search_products'],
      productIds: ['shirt-woman'],
      cardsShown: 1,
      rememberedSlots: { gender: 'women', category: 'shirt' },
    },
  },
})

assert.deepEqual(conversationQualityRequest({ qualityContract: null }, {}), {})

const runner = readFileSync('scripts/evaluate-agents.mjs', 'utf8')
assert.match(runner, /for \(const message of evaluationMessages\(test\)\)/)
assert.match(runner, /conversationQualityRequest\(test, result\)/)
assert.match(runner, /metrics: metrics \|\| null/)
assert.match(runner, /api\/evaluations\/calibrate/)
assert.match(runner, /summary\.failed \|\| summary\.calibrationFailures\.length/)
assert.match(runner, /evaluationModel/)

const requests = { chat: [], judge: null, run: null, calibrated: false, deleted: false }
const conversationId = '00000000-0000-4000-8000-000000000001'
const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  let body = null
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  }
  const send = value => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(value))
  }
  if (url.pathname === '/api/evaluations') return send({ success: true, data: [{
    id: '00000000-0000-4000-8000-000000000002',
    botId: '00000000-0000-4000-8000-000000000003',
    name: 'Runner multi-turno',
    question: 'Quale mi consigli?',
    conversationTurns: ['Cerco una camicia da donna', 'Elegante e nera'],
    qualityContract: { expectedTools: ['search_products'], cardPolicy: 'required', expectedMemory: { category: 'shirt' } },
    expectedKeywords: ['camicia'],
    forbiddenKeywords: [],
    minimumConfidence: 0.5,
    isActive: true,
    chatbot: { companyName: 'Test commerce' },
  }] })
  if (url.pathname.endsWith('/readiness')) return send({ success: true, data: { checks: [] } })
  if (url.pathname === '/api/chat') {
    requests.chat.push(body)
    return send({ success: true, data: {
      conversationId,
      assistantMessage: { content: requests.chat.length === 3 ? 'Ti consiglio la camicia verificata.' : 'Continuiamo.' },
      confidence: { score: 0.95 },
      intent: { type: 'product_discovery' },
      evaluationTrace: { tools: [{ name: 'search_products', success: true }], rememberedSlots: { category: 'shirt' } },
      productCards: [{ productId: 'shirt-woman' }],
    } })
  }
  if (url.pathname === '/api/evaluations/judge') {
    requests.judge = body
    return send({ success: true, data: {
      passed: true,
      failureReason: null,
      score: 0.95,
      evaluator: 'deterministic',
      dimensions: { benchmarkType: 'grounded', conversationQuality: { passed: true } },
    } })
  }
  if (url.pathname === '/api/evaluations/runs') {
    requests.run = body
    return send({ success: true, data: { id: 'run' } })
  }
  if (url.pathname === '/api/evaluations/calibrate') {
    requests.calibrated = true
    return send({ success: true, data: {} })
  }
  if (url.pathname === `/api/conversations/${conversationId}` && request.method === 'DELETE') {
    requests.deleted = true
    return send({ success: true })
  }
  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ success: false, error: `Unexpected ${request.method} ${url.pathname}` }))
})

server.listen(0, '127.0.0.1')
await once(server, 'listening')
const address = server.address()
assert(address && typeof address === 'object')
const execution = await new Promise(resolve => {
  const child = spawn(process.execPath, ['scripts/evaluate-agents.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, EVALUATION_BASE_URL: `http://127.0.0.1:${address.port}`, EVALUATION_ACCESS_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = '', stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.on('close', code => resolve({ code, stdout, stderr }))
})
server.close()

assert.equal(execution.code, 0, execution.stderr || execution.stdout)
assert.equal(requests.chat.length, 3)
assert.equal(new Set(requests.chat.map(item => item.userSessionId)).size, 1)
assert.deepEqual(requests.chat.map(item => item.message), ['Cerco una camicia da donna', 'Elegante e nera', 'Quale mi consigli?'])
assert.equal(requests.judge.conversationQuality.observation.tools[0], 'search_products')
assert.equal(requests.judge.conversationQuality.observation.rememberedSlots.category, 'shirt')
assert.equal(requests.run.metrics.conversationQuality.passed, true)
assert.equal(requests.run.metrics.evaluator, 'deterministic')
assert.equal(requests.calibrated, true)
assert.equal(requests.deleted, true)

console.log('Evaluation runner: 18 controlli multi-turno superati')
