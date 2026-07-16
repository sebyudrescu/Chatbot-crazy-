/**
 * Intent Classification System
 * Classifies user messages to route them appropriately
 */

import OpenAI from 'openai'
import { recordAIUsage } from './ai-usage'
import { DEFAULT_CHAT_MODEL } from './ai-models'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export type IntentType = 'greeting' | 'question' | 'identity_question' | 'chitchat' | 'escalation' | 'unknown'

export interface IntentResult {
  intent: IntentType
  confidence: number // 0.0 - 1.0
  reasoning?: string
  shouldUseRAG: boolean
}

/**
 * Classify user message intent using pattern matching + LLM fallback
 * 
 * Flow:
 * 1. Try fast pattern matching first (regex)
 * 2. If unclear, use LLM for classification
 * 3. Return intent + routing decision
 */
export async function classifyIntent(
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  tracking?: { botId?: string; conversationId?: string }
): Promise<IntentResult> {
  const normalizedMessage = message.trim().toLowerCase()

  // === FAST PATTERN MATCHING (covers 80% of cases) ===

  // 1. GREETING patterns
  const greetingPatterns = [
    /^(ciao|salve|buongiorno|buonasera|hey|hi|hello|salut)/i,
    /^(buon pomeriggio|buona giornata|buona sera)/i,
  ]

  for (const pattern of greetingPatterns) {
    if (pattern.test(normalizedMessage)) {
      return {
        intent: 'greeting',
        confidence: 0.95,
        reasoning: 'Pattern matched: greeting',
        shouldUseRAG: false,
      }
    }
  }

  // 2. ESCALATION patterns (wants human support)
  const escalationPatterns = [
    /(parlare con|contattare|chiamare).*(operatore|persona|umano|qualcuno)/i,
    /(voglio|vorrei|posso).*(parlare|sentire).*(operatore|persona|supporto)/i,
    /passa(re|mi).*(operatore|persona|umano)/i,
    /(numero|telefono|email).*(supporto|assistenza|contatto)/i,
    /non (mi aiuti|riesci|capisci)/i,
  ]

  for (const pattern of escalationPatterns) {
    if (pattern.test(normalizedMessage)) {
      return {
        intent: 'escalation',
        confidence: 0.9,
        reasoning: 'Pattern matched: escalation request',
        shouldUseRAG: false,
      }
    }
  }

  // 3. IDENTITY QUESTION patterns (about the company/business)
  // MUST be checked BEFORE generic questions to avoid false positives
  const identityPatterns = [
    /^(chi siete|chi sei|chi è|chi sono)/i,
    /^(cosa fate|cosa fa|cosa fanno|cosa offrite|cosa offre)/i,
    /^(di cosa vi occupate|di cosa si occupa|di cosa ti occupi)/i,
    /^(che servizi|quali servizi|che prodotti|quali prodotti)/i,
    /^(parlami di (voi|te|lei|loro)|presentati|presentatevi|dimmi chi)/i,
    /(mission|vision|valori|filosofia).*(azienda|company|vostra|tua)/i,
    /^(qual[eè] (la vostra|la tua|il vostro)).*(mission|attività|business)/i,
    /(vostra|tua|sua) (storia|attività|azienda|company)/i,
  ]

  for (const pattern of identityPatterns) {
    if (pattern.test(normalizedMessage)) {
      return {
        intent: 'identity_question',
        confidence: 0.95,
        reasoning: 'Pattern matched: company identity question',
        shouldUseRAG: true,
      }
    }
  }

  // 4. QUESTION patterns (interrogative words)
  const questionPatterns = [
    /^(cosa|come|quando|dove|perch[eé]|chi|quanto|quale)/i,
    /\?(.*?)$/i, // Ends with question mark
    /(puoi|potete|potresti).*(spiegare|dire|aiutare|mostrare)/i,
    /(vorrei sapere|voglio sapere|mi serve|ho bisogno)/i,
  ]

  for (const pattern of questionPatterns) {
    if (pattern.test(message)) {
      return {
        intent: 'question',
        confidence: 0.85,
        reasoning: 'Pattern matched: question',
        shouldUseRAG: true,
      }
    }
  }

  // 5. CHITCHAT patterns (small talk, off-topic)
  const chitchatPatterns = [
    /^(grazie|thank you|merci|ok|okay|va bene|perfetto|ottimo)/i,
    /come (stai|va|te la passi)/i,
    /(bel tempo|che giornata)/i,
    /^(sì|si|no|niente|nulla)/i,
  ]

  for (const pattern of chitchatPatterns) {
    if (pattern.test(normalizedMessage)) {
      return {
        intent: 'chitchat',
        confidence: 0.8,
        reasoning: 'Pattern matched: chitchat',
        shouldUseRAG: false,
      }
    }
  }

  // === LLM CLASSIFICATION (for ambiguous cases) ===
  // If no pattern matched, use LLM for more nuanced classification

  try {
    const classificationPrompt = `Classifica l'intent del seguente messaggio utente.

MESSAGGIO UTENTE: "${message}"

INTENTS POSSIBILI:
- greeting: saluti, presentazioni (es: "Ciao", "Buongiorno")
- identity_question: domande sull'identità, attività o servizi dell'azienda (es: "Chi siete?", "Cosa fate?", "Di cosa vi occupate?")
- question: domande informative che richiedono conoscenza specifica (es: "Quali sono i vostri orari?", "Come funziona il prodotto X?")
- chitchat: conversazione generica, ringraziamenti, conferme (es: "Grazie", "Ok perfetto", "Come stai?")
- escalation: richieste di parlare con umano o supporto diretto (es: "Voglio parlare con un operatore")

Rispondi SOLO con un JSON in questo formato:
{"intent": "identity_question|question|greeting|chitchat|escalation", "confidence": 0.8, "reasoning": "breve spiegazione"}

JSON:`

    const model = DEFAULT_CHAT_MODEL
    const startedAt = Date.now()
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Sei un classificatore di intenti. Rispondi SOLO con JSON valido.',
        },
        {
          role: 'user',
          content: classificationPrompt,
        },
      ],
      temperature: 0.0, // Deterministic
      max_tokens: 100,
    })
    await recordAIUsage({ botId: tracking?.botId, conversationId: tracking?.conversationId, feature: 'intent_classification', model, usage: completion.usage, durationMs: Date.now() - startedAt })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) {
      throw new Error('Empty LLM response')
    }

    // Parse JSON response
    const parsed = JSON.parse(response)
    const intent = parsed.intent as IntentType

    return {
      intent,
      confidence: parsed.confidence || 0.7,
      reasoning: `LLM classification: ${parsed.reasoning}`,
      shouldUseRAG: intent === 'question' || intent === 'identity_question',
    }
  } catch (error) {
    console.error('Intent classification LLM fallback failed:', error)

    // Ultimate fallback: assume it's a question (safer to use RAG)
    return {
      intent: 'question',
      confidence: 0.5,
      reasoning: 'Fallback: treating as question',
      shouldUseRAG: true,
    }
  }
}

/**
 * Generate appropriate response based on intent (for non-RAG intents)
 */
export async function generateIntentResponse(
  intent: IntentType,
  userMessage: string,
  companyName: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  businessContext?: any
): Promise<string> {
  const isFirstMessage = conversationHistory.length === 0

  switch (intent) {
    case 'greeting':
      if (isFirstMessage) {
        const intro = businessContext?.aboutUs 
          ? `${companyName}. ${businessContext.aboutUs.split('\n')[0].substring(0, 200)}`
          : companyName
        return `Ciao! 👋 Benvenuto su ${intro}

Sono il tuo assistente virtuale e sono qui per aiutarti. Come posso esserti utile oggi?`
      } else {
        return `Ciao! Sono sempre qui per aiutarti. Cosa posso fare per te?`
      }

    case 'chitchat':
      // Handle common chitchat responses
      const lowerMessage = userMessage.toLowerCase()

      if (lowerMessage.includes('grazie')) {
        return `Prego! Sono felice di averti aiutato. 😊

C'è altro con cui posso assisterti?`
      }

      if (lowerMessage.includes('come stai') || lowerMessage.includes('come va')) {
        return `Tutto bene, grazie! 🤖 Sono qui e pronto ad aiutarti con qualsiasi domanda su ${companyName}.

Cosa ti serve?`
      }

      if (/^(ok|okay|va bene|perfetto|ottimo|bene)/i.test(lowerMessage)) {
        return `Perfetto! Se hai altre domande, sono qui. 👍`
      }

      // Generic chitchat response
      return `Capisco! Se hai domande su ${companyName} o hai bisogno di assistenza, sono qui per aiutarti.

Come posso esserti utile?`

    case 'escalation':
      return `Capisco che preferisci parlare con una persona del nostro team.

📞 **Contatti supporto**:
• Email: supporto@${companyName.toLowerCase().replace(/\s+/g, '')}.com
• Telefono: disponibile durante gli orari d'ufficio
• Live chat: se disponibile sul sito

Nel frattempo, posso comunque provare ad aiutarti. Vuoi farmi una domanda?`

    default:
      return `Come posso aiutarti?`
  }
}

/**
 * Check if message is a follow-up question (requires conversation context)
 */
export function isFollowUpQuestion(
  message: string,
  conversationHistory: Array<{ role: string; content: string }>
): boolean {
  if (conversationHistory.length === 0) return false

  const followUpIndicators = [
    /^(e |ed |anche |inoltre |poi |quindi )/i,
    /(dettagli|più informazioni|puoi spiegare|cosa intendi)/i,
    /^(questo|quello|quella|questi|quelli)/i, // Demonstrative pronouns
  ]

  return followUpIndicators.some((pattern) => pattern.test(message.trim()))
}
