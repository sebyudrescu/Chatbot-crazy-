import type { ChatbotSettings } from './types'

export interface AgentPolicyDecision {
  action: 'allow' | 'fallback' | 'handoff'
  category?: 'forbidden_topic' | 'forbidden_response' | 'handoff_trigger'
  matchedRule?: string
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function matches(text: string, rule: string) {
  const normalizedText = normalize(text)
  const normalizedRule = normalize(rule)
  if (normalizedRule.length < 3) return false
  if (normalizedText.includes(normalizedRule)) return true
  const tokens = normalizedRule.split(' ').filter(token => token.length >= 4)
  if (!tokens.length) return false
  const textTokens = normalizedText.split(' ')
  const matched = tokens.filter(token => textTokens.some(textToken =>
    textToken === token || (token.length >= 5 && textToken.startsWith(token.slice(0, 5))),
  )).length
  return matched >= Math.max(1, Math.ceil(tokens.length * 0.6))
}

function firstMatch(text: string, rules?: string[]) {
  return (rules || []).find(rule => matches(text, rule))
}

export function evaluateIncomingPolicy(text: string, settings: ChatbotSettings): AgentPolicyDecision {
  const handoff = firstMatch(text, settings.handoffTriggers)
  if (handoff) return { action: 'handoff', category: 'handoff_trigger', matchedRule: handoff }
  const forbidden = firstMatch(text, settings.forbiddenTopics)
  if (forbidden) return { action: 'fallback', category: 'forbidden_topic', matchedRule: forbidden }
  return { action: 'allow' }
}

export function enforceOutgoingPolicy(text: string, settings: ChatbotSettings): AgentPolicyDecision {
  const forbidden = firstMatch(text, settings.forbiddenResponses)
  return forbidden
    ? { action: 'fallback', category: 'forbidden_response', matchedRule: forbidden }
    : { action: 'allow' }
}

export function policyResponse(decision: AgentPolicyDecision, settings: ChatbotSettings) {
  if (decision.action === 'handoff') {
    return settings.handoffMessage || 'Questa richiesta richiede assistenza umana. Ho inoltrato la conversazione a un operatore, che potrà continuare da qui.'
  }
  return settings.fallbackMessage || 'Non posso aiutarti con questa richiesta. Posso metterti in contatto con una persona del team.'
}
