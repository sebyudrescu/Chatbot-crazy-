export type GroundingAction = 'allow' | 'caution' | 'fallback'

export interface GroundingPolicyInput {
  requiresGrounding: boolean
  confidence: number
  threshold: number
  knowledgeChunks: number
  persistentFacts: number
  graphEntities: number
  hasVerifiedCommerceContext?: boolean
  hasAuthoritativeBusinessContext?: boolean
  coherenceScore?: number
}

export interface GroundingPolicyDecision {
  action: GroundingAction
  reason: 'not_required' | 'verified_commerce' | 'authoritative_business_context' | 'no_evidence' | 'low_coherence' | 'below_threshold' | 'limited_margin' | 'grounded'
  evidenceCount: number
  confidence: number
  threshold: number
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

export function evaluateGroundingPolicy(input: GroundingPolicyInput): GroundingPolicyDecision {
  const confidence = clamp(input.confidence)
  const threshold = clamp(input.threshold)
  const retrievedEvidenceCount = input.knowledgeChunks + input.persistentFacts + input.graphEntities
  const authoritativeBusinessEvidence = input.hasAuthoritativeBusinessContext ? 1 : 0
  const evidenceCount = retrievedEvidenceCount + authoritativeBusinessEvidence

  if (!input.requiresGrounding) {
    return { action: 'allow', reason: 'not_required', evidenceCount, confidence, threshold }
  }
  if (input.hasVerifiedCommerceContext) {
    return { action: 'allow', reason: 'verified_commerce', evidenceCount: evidenceCount + 1, confidence: Math.max(confidence, 0.9), threshold }
  }
  if (evidenceCount === 0) {
    return { action: 'fallback', reason: 'no_evidence', evidenceCount, confidence, threshold }
  }
  if (input.coherenceScore !== undefined && input.coherenceScore < 0.5) {
    return { action: 'fallback', reason: 'low_coherence', evidenceCount, confidence, threshold }
  }
  if (confidence < threshold) {
    return { action: 'fallback', reason: 'below_threshold', evidenceCount, confidence, threshold }
  }
  if (confidence < threshold + 0.08 || (input.coherenceScore !== undefined && input.coherenceScore < 0.75)) {
    return { action: 'caution', reason: 'limited_margin', evidenceCount, confidence, threshold }
  }
  if (authoritativeBusinessEvidence > 0 && retrievedEvidenceCount === 0) {
    return { action: 'allow', reason: 'authoritative_business_context', evidenceCount, confidence, threshold }
  }
  return { action: 'allow', reason: 'grounded', evidenceCount, confidence, threshold }
}

export function groundingFallbackMessage(configuredMessage?: string, language = 'it'): string {
  const configured = configuredMessage?.trim()
  if (configured) return configured
  if (/^en(?:-|$)|english/i.test(language)) {
    return "I don't have enough verified information to answer accurately. I can help with another question or pass this request to the team."
  }
  return 'Non ho abbastanza informazioni verificate per rispondere con precisione. Posso aiutarti con un’altra domanda oppure passare la richiesta al team.'
}

export function addGroundingCaution(response: string, language = 'it'): string {
  const notice = /^en(?:-|$)|english/i.test(language)
    ? 'Note: this answer is based on the verified information currently available, which may be incomplete.'
    : 'Nota: questa risposta si basa sulle informazioni verificate disponibili, che potrebbero essere parziali.'
  return `${response.trim()}\n\n${notice}`
}
