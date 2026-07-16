/**
 * OpenAI Parameters Manager
 * Determina i parametri ottimali per le chiamate OpenAI basandosi su:
 * - Intent dell'utente
 * - Classificazione della query
 * - Template del chatbot
 */

import { QueryClassification, QueryType } from './query-classifier'

export interface OpenAIParams {
  temperature: number
  maxTokens: number
  topP: number
  presencePenalty: number
  frequencyPenalty: number
}

export interface ParamsContext {
  intent: string
  queryClassification: QueryClassification
  templateId: string | null
  conversationLength: number
}

/**
 * Temperature mapping per tipo di query
 */
const TEMPERATURE_MAP: Record<QueryType, number> = {
  factual: 0.1,        // Massima precisione per domande fattuali
  creative: 0.9,       // Libertà creativa
  conversational: 0.6, // Bilanciato
  complex: 0.3,        // Precisione ma con flessibilità
}

/**
 * Max tokens mapping per complessità
 */
const MAX_TOKENS_MAP = {
  greeting: 150,
  chitchat: 200,
  simple: 256,
  medium: 512,
  complex: 1024,
}

/**
 * Calcola i parametri ottimali per una chiamata OpenAI
 */
export function getOptimalParams(context: ParamsContext): OpenAIParams {
  const { intent, queryClassification, templateId, conversationLength } = context
  
  // 1. TEMPERATURE
  let temperature = TEMPERATURE_MAP[queryClassification.type]
  
  // Adjust per intent specifici
  if (intent === 'greeting') {
    temperature = 0.5 // Naturale ma consistente
  } else if (intent === 'escalation') {
    temperature = 0.2 // Preciso per escalation
  }
  
  // Adjust per template
  if (templateId === 'sales-agent') {
    // Sales può essere più persuasivo (leggermente più creativo)
    temperature = Math.min(1.0, temperature + 0.1)
  } else if (templateId === 'faq-bot') {
    // FAQ deve essere deterministico
    temperature = Math.min(temperature, 0.3)
  }
  
  // 2. MAX TOKENS
  let maxTokens = MAX_TOKENS_MAP.medium
  
  if (intent === 'greeting') {
    maxTokens = MAX_TOKENS_MAP.greeting
  } else if (intent === 'chitchat') {
    maxTokens = MAX_TOKENS_MAP.chitchat
  } else if (queryClassification.complexity === 'simple') {
    maxTokens = MAX_TOKENS_MAP.simple
  } else if (queryClassification.complexity === 'complex') {
    maxTokens = MAX_TOKENS_MAP.complex
  }
  
  // Se query creativa o complessa, serve più spazio
  if (queryClassification.type === 'creative' || queryClassification.type === 'complex') {
    maxTokens = Math.max(maxTokens, MAX_TOKENS_MAP.complex)
  }
  
  // Limita se conversazione molto lunga (per budget)
  if (conversationLength > 20) {
    maxTokens = Math.min(maxTokens, MAX_TOKENS_MAP.medium)
  }
  
  // 3. TOP_P
  let topP = 1.0 // Default: sampling completo
  
  // Se temperature molto bassa, riduci top_p per focus su token probabili
  if (temperature < 0.3) {
    topP = 0.9
  }
  
  // 4. PRESENCE PENALTY (evita ripetizioni di concetti)
  let presencePenalty = 0.0
  
  // Attiva solo per risposte lunghe o template verbose
  if (
    maxTokens > 500 ||
    templateId === 'customer-support' ||
    templateId === 'consulting-advisor'
  ) {
    presencePenalty = 0.3
  }
  
  // Aumenta se conversazione lunga (evita ripetere concetti già detti)
  if (conversationLength > 10) {
    presencePenalty = Math.min(1.0, presencePenalty + 0.2)
  }
  
  // 5. FREQUENCY PENALTY (evita ripetizioni di parole)
  let frequencyPenalty = 0.0
  
  // Attiva per risposte lunghe
  if (maxTokens > 500) {
    frequencyPenalty = 0.5
  }
  
  // Template customer-support tende a ripetere "gentile cliente"
  if (templateId === 'customer-support') {
    frequencyPenalty = 0.6
  }
  
  // Template sales può ripetere call-to-action
  if (templateId === 'sales-agent') {
    frequencyPenalty = 0.4
  }
  
  return {
    temperature,
    maxTokens,
    topP,
    presencePenalty,
    frequencyPenalty,
  }
}

/**
 * Ritorna parametri con override manuale
 */
export function getParamsWithOverride(
  context: ParamsContext,
  override: Partial<OpenAIParams>
): OpenAIParams {
  const optimal = getOptimalParams(context)
  return { ...optimal, ...override }
}

/**
 * Logging helper per debugging
 */
export function logParams(params: OpenAIParams, context: ParamsContext): void {
  console.log('🎛️ OpenAI Params:')
  console.log(`  Intent: ${context.intent}`)
  console.log(`  Query Type: ${context.queryClassification.type}`)
  console.log(`  Complexity: ${context.queryClassification.complexity}`)
  console.log(`  Temperature: ${params.temperature}`)
  console.log(`  Max Tokens: ${params.maxTokens}`)
  console.log(`  Top P: ${params.topP}`)
  console.log(`  Presence Penalty: ${params.presencePenalty}`)
  console.log(`  Frequency Penalty: ${params.frequencyPenalty}`)
}

/**
 * Calcola costo approssimativo in USD
 */
export function estimateCost(params: OpenAIParams, model: string = 'gpt-4o-mini'): number {
  const prices = model.startsWith('gpt-4.1-mini')
    ? { input: 0.4, output: 1.6 }
    : model.startsWith('gpt-4.1')
      ? { input: 2, output: 8 }
      : model.startsWith('gpt-4o-mini')
        ? { input: 0.15, output: 0.6 }
        : { input: 2.5, output: 10 }
  const outputCost = (params.maxTokens / 1_000_000) * prices.output
  
  // Assume 500 tokens di input medio (context + query)
  const inputCost = (500 / 1_000_000) * prices.input
  
  return inputCost + outputCost
}
