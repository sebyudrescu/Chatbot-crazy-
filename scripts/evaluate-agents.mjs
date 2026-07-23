const baseUrl = process.env.EVALUATION_BASE_URL || 'http://localhost:3000'
let authCookie = ''

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(authCookie ? { Cookie: authCookie } : {}), ...(options.headers || {}) } })
  const body = await response.json()
  if (!response.ok || body.success === false) throw new Error(body.error || `${response.status} ${path}`)
  return body
}

const password = process.env.EVALUATION_ACCESS_PASSWORD || process.env.APP_ACCESS_PASSWORD
if (password) {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!login.ok) throw new Error(`Evaluation authentication failed: ${login.status}`)
  authCookie = (login.headers.get('set-cookie') || '').split(';')[0]
}

const cases = (await request('/api/evaluations')).data.filter(item => item.isActive)
const summary = { total: cases.length, passed: 0, failed: 0, results: [] }

for (const test of cases) {
  const started = Date.now(); let conversationId = null; let response = ''; let confidence = null; const failures = []
  try {
    const chat = await request('/api/chat', { method: 'POST', body: JSON.stringify({ botId: test.botId, message: test.question, userSessionId: `evaluation_cli_${test.id}_${Date.now()}` }) })
    response = chat.data.assistantMessage.content; confidence = chat.data.confidence?.score ?? null; conversationId = chat.data.conversationId
    const judge = await request('/api/evaluations/judge', {
      method: 'POST',
      body: JSON.stringify({
        botId: test.botId,
        question: test.question,
        response,
        confidence,
        expectedKeywords: test.expectedKeywords,
        forbiddenKeywords: test.forbiddenKeywords,
        minimumConfidence: test.minimumConfidence,
      }),
    })
    if (!judge.data.passed) failures.push(judge.data.failureReason || `Qualità ${Math.round((judge.data.score || 0) * 100)}%`)
  } catch (error) { failures.push(error instanceof Error ? error.message : 'Errore sconosciuto') }
  const passed = failures.length === 0 && Boolean(response)
  await request('/api/evaluations/runs', { method: 'POST', body: JSON.stringify({ caseId: test.id, passed, response, confidence, latencyMs: Date.now() - started, failureReason: failures.join(' · ') || null }) })
  if (conversationId) await fetch(`${baseUrl}/api/conversations/${conversationId}`, { method: 'DELETE' }).catch(() => {})
  summary[passed ? 'passed' : 'failed']++; summary.results.push({ case: test.name, agent: test.chatbot.companyName, passed, failures })
}

console.log(JSON.stringify(summary, null, 2))
if (summary.failed) process.exitCode = 1
