/**
 * Response Length Controller
 * 
 * Adjusts response length based on conversation context:
 * - First contact → Short elevator pitch (2-3 sentences)
 * - Identity questions → Concise and value-focused
 * - Technical questions → Full detailed response
 * - Follow-ups → Medium length
 * 
 * Goal: Optimize for conversion in early conversation stages
 */

import { createLazyOpenAI } from './openai-client'
import { DEFAULT_CHAT_MODEL } from './ai-models'

const openai = createLazyOpenAI()

export interface ConversationContext {
  messageCount: number           // How many messages in this conversation?
  intentType: string             // identity_question, question, greeting, etc.
  userEngagement?: 'high' | 'medium' | 'low'  // Based on feedback/sentiment
  isFirstMessage?: boolean       // Is this the very first user message?
}

export interface LengthControlResult {
  adjustedResponse: string
  originalLength: number
  adjustedLength: number
  strategy: 'elevator_pitch' | 'concise' | 'medium' | 'detailed' | 'unchanged'
  reasoning: string
}

/**
 * Main function: Adjust response length based on context
 */
export async function adjustResponseLength(
  rawResponse: string,
  context: ConversationContext
): Promise<LengthControlResult> {
  
  const originalLength = rawResponse.length
  
  console.log(`[Length Controller] Analyzing response (${originalLength} chars)...`)
  console.log(`[Length Controller] Context: messages=${context.messageCount}, intent=${context.intentType}`)
  
  // Determine strategy based on context
  const strategy = determineStrategy(context)
  
  console.log(`[Length Controller] Strategy selected: ${strategy}`)
  
  // Apply strategy
  let adjustedResponse: string
  let reasoning: string
  
  switch (strategy) {
    case 'elevator_pitch':
      adjustedResponse = await summarizeToElevatorPitch(rawResponse)
      reasoning = 'First contact with identity question - must be concise and impactful'
      break
      
    case 'concise':
      adjustedResponse = await summarizeToConcise(rawResponse)
      reasoning = 'Early conversation stage - keep it short and focused'
      break
      
    case 'medium':
      adjustedResponse = await summarizeToMedium(rawResponse)
      reasoning = 'Balanced response for engaged user'
      break
      
    case 'detailed':
      adjustedResponse = rawResponse  // Keep full response
      reasoning = 'Technical question or high engagement - provide full details'
      break
      
    case 'unchanged':
      adjustedResponse = rawResponse
      reasoning = 'Response already optimal length'
      break
  }
  
  const adjustedLength = adjustedResponse.length
  const reduction = ((originalLength - adjustedLength) / originalLength * 100).toFixed(1)
  
  console.log(`[Length Controller] Result: ${originalLength} → ${adjustedLength} chars (-${reduction}%)`)
  
  return {
    adjustedResponse,
    originalLength,
    adjustedLength,
    strategy,
    reasoning
  }
}

/**
 * Determine which strategy to use based on conversation context
 */
function determineStrategy(context: ConversationContext): LengthControlResult['strategy'] {
  
  // FIRST MESSAGE + IDENTITY QUESTION → Elevator pitch
  if (context.messageCount <= 2 && context.intentType === 'identity_question') {
    return 'elevator_pitch'
  }
  
  // EARLY CONVERSATION (< 4 messages) → Concise
  if (context.messageCount < 4 && context.intentType !== 'question') {
    return 'concise'
  }
  
  // TECHNICAL QUESTIONS → Detailed (always keep full response)
  if (context.intentType === 'question' && context.userEngagement === 'high') {
    return 'detailed'
  }
  
  // HIGH ENGAGEMENT → Detailed
  if (context.userEngagement === 'high') {
    return 'detailed'
  }
  
  // LOW ENGAGEMENT → Concise (try to re-engage)
  if (context.userEngagement === 'low') {
    return 'concise'
  }
  
  // DEFAULT → Medium
  return 'medium'
}

/**
 * Summarize to elevator pitch (2-3 sentences, ~150-200 chars)
 * Used for first contact with identity questions
 */
async function summarizeToElevatorPitch(text: string): Promise<string> {
  
  // If already short enough, return as-is
  if (text.length <= 200) {
    return text
  }
  
  console.log(`[Elevator Pitch] Summarizing to max 2 sentences...`)
  
  const prompt = `Riassumi questo testo in MASSIMO 2 FRASI BREVI (120-150 caratteri totali).

OBIETTIVO CRITICO: Risposta brevissima, impattante, orientata al valore commerciale.

REGOLE OBBLIGATORIE:
1. MASSIMO 2 frasi (non 3!)
2. Ogni frase: MAX 10-12 parole
3. Mantieni identità aziendale ("siamo X")
4. Focus SOLO su: CHI SIAMO + COSA OFFRIAMO
5. Elimina TUTTO il resto: dettagli, storia, numeri, certificazioni, esempi
6. Tono diretto e commerciale
7. No frasi subordinate complesse

TESTO ORIGINALE:
${text}

RISPOSTA (MAX 2 FRASI BREVI):`

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,  // Very low for precision
      max_tokens: 80  // Force brevity (was 150)
    })
    
    const summary = completion.choices[0]?.message?.content?.trim() || text
    
    console.log(`[Elevator Pitch] ✅ Reduced to ${summary.length} chars`)
    
    return summary
    
  } catch (error) {
    console.error(`[Elevator Pitch] ❌ Error:`, error)
    return text  // Fallback to original
  }
}

/**
 * Summarize to concise (3-4 sentences, ~250-350 chars)
 * Used for early conversation
 */
async function summarizeToConcise(text: string): Promise<string> {
  
  // If already short enough, return as-is
  if (text.length <= 300) {
    return text
  }
  
  console.log(`[Concise] Summarizing to 2-3 sentences...`)
  
  const prompt = `Riassumi questo testo in modo CONCISO: 2-3 frasi (200-250 caratteri).

OBIETTIVO: Risposta chiara, diretta e commercialmente efficace.

REGOLE:
1. MASSIMO 3 frasi brevi
2. Elimina dettagli non essenziali
3. Mantieni identità aziendale e punti chiave
4. Tono diretto e professionale
5. No subordinate complesse

TESTO ORIGINALE:
${text}

VERSIONE CONCISA (2-3 frasi):`

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 120  // Force brevity (was 200)
    })
    
    const summary = completion.choices[0]?.message?.content?.trim() || text
    
    console.log(`[Concise] ✅ Reduced to ${summary.length} chars`)
    
    return summary
    
  } catch (error) {
    console.error(`[Concise] ❌ Error:`, error)
    return text
  }
}

/**
 * Summarize to medium length (4-6 sentences, ~400-600 chars)
 * Used for balanced responses
 */
async function summarizeToMedium(text: string): Promise<string> {
  
  // If already medium length, return as-is
  if (text.length <= 700) {
    return text
  }
  
  console.log(`[Medium] Summarizing to 4-6 sentences...`)
  
  const prompt = `Riassumi questo testo in modo BILANCIATO: 4-6 frasi (400-600 caratteri).

OBIETTIVO: Risposta completa ma non eccessiva.

REGOLE:
1. Mantieni informazioni principali + alcuni dettagli rilevanti
2. Elimina solo ripetizioni e dettagli molto secondari
3. Mantieni struttura e tono
4. MASSIMO 6 frasi

TESTO ORIGINALE:
${text}

VERSIONE BILANCIATA (4-6 frasi):`

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 300
    })
    
    const summary = completion.choices[0]?.message?.content?.trim() || text
    
    console.log(`[Medium] ✅ Reduced to ${summary.length} chars`)
    
    return summary
    
  } catch (error) {
    console.error(`[Medium] ❌ Error:`, error)
    return text
  }
}

/**
 * Utility: Check if response is already optimal length
 */
export function isOptimalLength(
  text: string,
  strategy: LengthControlResult['strategy']
): boolean {
  
  switch (strategy) {
    case 'elevator_pitch':
      return text.length <= 250
    case 'concise':
      return text.length <= 400
    case 'medium':
      return text.length <= 700
    case 'detailed':
      return true  // Any length is fine for detailed
    default:
      return true
  }
}
