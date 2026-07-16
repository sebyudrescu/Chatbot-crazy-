export interface EvaluationCriteria {
  expectedKeywords: string[]
  forbiddenKeywords: string[]
  minimumConfidence: number
}

export function evaluateResponse(response: string, confidence: number | null | undefined, criteria: EvaluationCriteria) {
  const normalized = response.toLocaleLowerCase('it')
  const missing = criteria.expectedKeywords.filter(keyword => !normalized.includes(keyword.toLocaleLowerCase('it')))
  const forbidden = criteria.forbiddenKeywords.filter(keyword => normalized.includes(keyword.toLocaleLowerCase('it')))
  const failures: string[] = []
  if (!response.trim()) failures.push('Risposta vuota')
  if (missing.length) failures.push(`Parole attese mancanti: ${missing.join(', ')}`)
  if (forbidden.length) failures.push(`Contenuti vietati trovati: ${forbidden.join(', ')}`)
  if (confidence != null && confidence < criteria.minimumConfidence) failures.push(`Confidenza ${Math.round(confidence * 100)}% sotto la soglia ${Math.round(criteria.minimumConfidence * 100)}%`)
  return { passed: failures.length === 0, failureReason: failures.join(' · ') || null }
}

export function parseKeywords(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [] }
  catch { return [] }
}
