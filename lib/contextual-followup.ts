/**
 * Contextual Follow-up Question Generator
 * 
 * Generates smart follow-up questions to maintain conversation flow.
 * The bot never leaves the user wondering "what now?"
 * 
 * Key principles:
 * - Follow-up MUST be contextually relevant to what was just said
 * - Guide user toward valuable actions (not just keep talking)
 * - Adapt based on conversation stage and user intent
 * - Sound natural, not forced or scripted
 */

import OpenAI from 'openai'
import type { BusinessContext } from './business-context'
import type { IntentType } from './intent-classifier'
import { recordAIUsage } from './ai-usage'
import { DEFAULT_CHAT_MODEL } from './ai-models'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface FollowUpContext {
  intentType: IntentType
  responseContent: string           // What we just said
  businessContext?: BusinessContext
  conversationStage: number         // How many messages exchanged
  extractedEntities?: Array<{
    type: string
    name: string
    id?: string
  }>
  userGoalDetected?: 'explore' | 'purchase' | 'support' | 'inform' | 'unknown'
  botId?: string
  conversationId?: string
}

export interface FollowUpResult {
  question: string
  reasoning: string
  confidence: number
  suggestedAction?: 'ask_more' | 'request_quote' | 'explore_service' | 'contact' | 'escalate'
}

/**
 * Main function: Generate contextual follow-up question
 */
export async function generateFollowUpQuestion(
  context: FollowUpContext
): Promise<FollowUpResult> {
  
  console.log(`[Follow-up] Generating for intent: ${context.intentType}, stage: ${context.conversationStage}`)
  
  // STRATEGY 1: Pattern-based for common scenarios (fast)
  const patternBased = tryPatternBasedFollowUp(context)
  if (patternBased) {
    console.log(`[Follow-up] Using pattern-based: "${patternBased.question}"`)
    return patternBased
  }
  
  // STRATEGY 2: LLM-generated for complex scenarios (smart but slower)
  const llmGenerated = await generateLLMFollowUp(context)
  console.log(`[Follow-up] Using LLM-generated: "${llmGenerated.question}"`)
  
  return llmGenerated
}

/**
 * Try to generate follow-up using patterns (fast, deterministic)
 */
function tryPatternBasedFollowUp(context: FollowUpContext): FollowUpResult | null {
  
  const { intentType, conversationStage, businessContext, extractedEntities } = context
  
  // ==========================================
  // IDENTITY QUESTIONS
  // ==========================================
  if (intentType === 'identity_question') {
    
    // FIRST MESSAGE → Guide to services or quote
    if (conversationStage <= 2) {
      
      // If we have specific services in business context, mention them
      if (businessContext?.mainServices && businessContext.mainServices.length > 0) {
        const topService = businessContext.mainServices[0]
        
        return {
          question: `Vuoi sapere di più sui servizi o preferisci un preventivo?`,
          reasoning: 'First identity question - guide to action (services or quote)',
          confidence: 0.9,
          suggestedAction: 'explore_service'
        }
      }
      
      // Generic fallback (shorter and more direct)
      return {
        question: 'Preferisci scoprire i servizi o ricevere un preventivo?',
        reasoning: 'First identity question - direct choice between exploration and conversion',
        confidence: 0.85,
        suggestedAction: 'explore_service'
      }
    }
    
    // LATER IN CONVERSATION → More specific
    return {
      question: 'C\'è un servizio o un\'area specifica su cui vuoi maggiori dettagli?',
      reasoning: 'Follow-up identity question - drill down',
      confidence: 0.8,
      suggestedAction: 'ask_more'
    }
  }
  
  // ==========================================
  // SPECIFIC QUESTIONS (factual)
  // ==========================================
  if (intentType === 'question') {
    
    // If entities were mentioned (product, service, feature)
    if (extractedEntities && extractedEntities.length > 0) {
      const entity = extractedEntities[0]
      
      // Service entity → offer pricing or details
      if (entity.type === 'service' || entity.type === 'product') {
        return {
          question: `Vuoi conoscere i dettagli su prezzi e tempistiche per ${entity.name}?`,
          reasoning: 'Service/product mentioned - offer pricing info',
          confidence: 0.85,
          suggestedAction: 'request_quote'
        }
      }
    }
    
    // Generic follow-up for questions
    if (conversationStage > 3) {
      return {
        question: 'Ti è tutto chiaro o vuoi approfondire qualche aspetto?',
        reasoning: 'Generic question follow-up - check understanding',
        confidence: 0.75,
        suggestedAction: 'ask_more'
      }
    }
  }
  
  // ==========================================
  // GREETING (warm-up)
  // ==========================================
  if (intentType === 'greeting' && conversationStage === 1) {
    return {
      question: 'Come posso aiutarti oggi?',
      reasoning: 'First greeting - open conversation',
      confidence: 0.9,
      suggestedAction: 'ask_more'
    }
  }
  
  // No pattern matched
  return null
}

/**
 * Generate follow-up using LLM (slower but more contextual)
 */
async function generateLLMFollowUp(context: FollowUpContext): Promise<FollowUpResult> {
  
  const { intentType, responseContent, businessContext, conversationStage } = context
  
  // Build context for LLM
  let servicesInfo = ''
  if (businessContext?.mainServices && businessContext.mainServices.length > 0) {
    servicesInfo = `\nServizi offerti: ${businessContext.mainServices.join(', ')}`
  }
  
  const prompt = `Sei un assistente commerciale esperto. Hai appena risposto a un cliente e ora devi generare una DOMANDA DI CONTINUITÀ per mantenere attiva la conversazione.

CONTESTO CONVERSAZIONE:
- Tipo di domanda: ${intentType}
- Numero messaggi scambiati: ${conversationStage}
- Risposta appena data: "${responseContent}"${servicesInfo}

OBIETTIVI DELLA DOMANDA:
1. Mantenere il flusso conversazionale attivo
2. Guidare verso azioni di valore (esplorazione servizi, preventivi, supporto)
3. Suonare naturale, non forzata
4. Essere contestualmente rilevante a ciò che è stato appena detto

REGOLE:
- UNA sola domanda, BREVE e chiara (max 10-12 parole)
- NON ripetere ciò che è già stato detto
- NON usare domande generiche tipo "posso aiutarti con altro?"
- DEVE essere specifica e orientata all'azione
- Offrire SCELTA tra 2 opzioni chiare (es: "servizi o preventivo?")
- Tono diretto e commerciale
- Massimo 12 parole

ESEMPI BUONI (dal punto di vista utente):
✅ "Vuoi sapere di più sui servizi o preferisci un preventivo?"
✅ "Ti interessa capire come funziona il processo?"
✅ "Preferisci i dettagli tecnici o i prezzi?"

ESEMPI CATTIVI:
❌ "Posso aiutarti con altro?" (troppo generico)
❌ "Hai altre domande?" (troppo vago)
❌ "Come posso esserti utile?" (non contestuale)
❌ "C'è qualcos'altro che dovresti sapere?" (prospettiva sbagliata - deve essere "che dovrei sapere")

Genera SOLO la domanda, senza spiegazioni.`

  try {
    const model = DEFAULT_CHAT_MODEL
    const startedAt = Date.now()
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,  // Higher for more natural variation
      max_tokens: 50
    })
    await recordAIUsage({ botId: context.botId, conversationId: context.conversationId, feature: 'followup_generation', model, usage: completion.usage, durationMs: Date.now() - startedAt })
    
    const question = completion.choices[0]?.message?.content?.trim() || 'Posso aiutarti con altro?'
    
    // Remove quotes if LLM added them
    const cleanQuestion = question.replace(/^["']|["']$/g, '')
    
    return {
      question: cleanQuestion,
      reasoning: 'LLM-generated contextual follow-up',
      confidence: 0.8,
      suggestedAction: determineActionFromQuestion(cleanQuestion)
    }
    
  } catch (error) {
    console.error(`[Follow-up] LLM generation failed:`, error)
    
    // Fallback to safe generic question
    return {
      question: 'C\'è qualcos\'altro su cui posso aiutarti?',
      reasoning: 'Fallback due to LLM error',
      confidence: 0.5,
      suggestedAction: 'ask_more'
    }
  }
}

/**
 * Determine suggested action from question content
 */
function determineActionFromQuestion(question: string): FollowUpResult['suggestedAction'] {
  const lower = question.toLowerCase()
  
  if (lower.includes('preventivo') || lower.includes('prezzo') || lower.includes('costo')) {
    return 'request_quote'
  }
  
  if (lower.includes('servizio') || lower.includes('prodotto') || lower.includes('offriamo')) {
    return 'explore_service'
  }
  
  if (lower.includes('operatore') || lower.includes('parlare') || lower.includes('contatto')) {
    return 'contact'
  }
  
  return 'ask_more'
}

/**
 * Validate follow-up question quality
 */
export function validateFollowUpQuality(question: string): { valid: boolean; reason?: string } {
  
  // Too short
  if (question.length < 10) {
    return { valid: false, reason: 'Question too short' }
  }
  
  // Too long
  if (question.length > 150) {
    return { valid: false, reason: 'Question too long' }
  }
  
  // Generic patterns (bad)
  const genericPatterns = [
    /^posso aiutarti$/i,
    /^hai altre domande\?$/i,
    /^come posso aiutarti\?$/i,
    /^qualcos'altro\?$/i
  ]
  
  for (const pattern of genericPatterns) {
    if (pattern.test(question)) {
      return { valid: false, reason: 'Too generic' }
    }
  }
  
  // Must end with question mark or be clearly a question
  if (!question.endsWith('?') && !question.toLowerCase().includes('vuoi') && !question.toLowerCase().includes('preferisci')) {
    return { valid: false, reason: 'Not a question' }
  }
  
  return { valid: true }
}

/**
 * Utility: Should we add a follow-up for this intent?
 */
export function shouldAddFollowUp(intentType: IntentType, conversationStage: number): boolean {
  
  // ALWAYS add follow-up for identity questions (guide to action)
  if (intentType === 'identity_question') {
    return true
  }
  
  // Add for questions if not too many messages yet
  if (intentType === 'question' && conversationStage < 10) {
    return true
  }
  
  // Add for early greetings
  if (intentType === 'greeting' && conversationStage <= 2) {
    return true
  }
  
  // Skip for chitchat (not valuable)
  if (intentType === 'chitchat') {
    return false
  }
  
  // Skip for escalation (user wants human)
  if (intentType === 'escalation') {
    return false
  }
  
  // Default: add if early conversation
  return conversationStage < 5
}
