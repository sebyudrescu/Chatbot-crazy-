/**
 * Conversation Memory System
 * Extracts structured data and manages conversation summarization
 */

import { createLazyOpenAI } from './openai-client'
import { DEFAULT_CHAT_MODEL } from './ai-models'

const openai = createLazyOpenAI()

export interface ExtractedUserData {
  name?: string
  email?: string
  phone?: string
  company?: string
  customFields?: Record<string, any>
}

export interface ConversationMetadata {
  userIntent?: string // "support" | "sales" | "info" | "complaint"
  sentiment?: string // "positive" | "neutral" | "negative"
  isResolved?: boolean
  extractedData?: ExtractedUserData
  topicsDiscussed?: string[]
}

/**
 * Extract structured user data from conversation
 * Looks for: name, email, phone, company
 */
export async function extractUserData(
  messages: Array<{ role: string; content: string }>
): Promise<ExtractedUserData> {
  if (messages.length === 0) {
    return {}
  }

  // Build conversation text
  const conversationText = messages
    .filter((msg) => msg.role === 'user')
    .map((msg) => msg.content)
    .join('\n')

  const extractionPrompt = `Analizza questa conversazione ed estrai SOLO le informazioni utente che sono state esplicitamente menzionate.

CONVERSAZIONE:
${conversationText}

REGOLE:
- Estrai SOLO informazioni che l'utente ha fornito esplicitamente
- NON inventare o dedurre informazioni
- Se un'informazione non è presente, non includerla
- Valida formato email e telefono

Rispondi SOLO con un JSON in questo formato:
{
  "name": "nome completo se fornito",
  "email": "email@example.com se fornita",
  "phone": "telefono se fornito",
  "company": "nome azienda se fornita"
}

Se nessuna informazione è presente, rispondi con: {}

JSON:`

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Sei un estrattore di dati. Rispondi SOLO con JSON valido.',
        },
        {
          role: 'user',
          content: extractionPrompt,
        },
      ],
      temperature: 0.0,
      max_tokens: 200,
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) {
      return {}
    }

    // Parse JSON response
    const extracted = JSON.parse(response)

    // Validate and clean
    const result: ExtractedUserData = {}

    if (extracted.name && typeof extracted.name === 'string') {
      result.name = extracted.name.trim()
    }

    if (extracted.email && isValidEmail(extracted.email)) {
      result.email = extracted.email.toLowerCase().trim()
    }

    if (extracted.phone && typeof extracted.phone === 'string') {
      result.phone = extracted.phone.trim()
    }

    if (extracted.company && typeof extracted.company === 'string') {
      result.company = extracted.company.trim()
    }

    return result
  } catch (error) {
    console.error('Error extracting user data:', error)
    return {}
  }
}

/**
 * Analyze conversation metadata: intent, sentiment, resolution
 */
export async function analyzeConversationMetadata(
  messages: Array<{ role: string; content: string }>
): Promise<ConversationMetadata> {
  if (messages.length === 0) {
    return {}
  }

  const conversationText = messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n')

  const analysisPrompt = `Analizza questa conversazione e fornisci metadata.

CONVERSAZIONE:
${conversationText}

Analizza:
1. INTENT principale: cosa vuole l'utente? (support/sales/info/complaint)
2. SENTIMENT: come si sente l'utente? (positive/neutral/negative)
3. RESOLVED: il problema/domanda è stato risolto? (true/false)
4. TOPICS: argomenti principali discussi (max 3)

Rispondi SOLO con JSON:
{
  "userIntent": "support|sales|info|complaint",
  "sentiment": "positive|neutral|negative",
  "isResolved": true|false,
  "topicsDiscussed": ["topic1", "topic2", "topic3"]
}

JSON:`

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Sei un analizzatore di conversazioni. Rispondi SOLO con JSON valido.',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
      temperature: 0.0,
      max_tokens: 200,
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) {
      return {}
    }

    const analysis = JSON.parse(response)

    return {
      userIntent: analysis.userIntent,
      sentiment: analysis.sentiment,
      isResolved: analysis.isResolved === true,
      topicsDiscussed: Array.isArray(analysis.topicsDiscussed)
        ? analysis.topicsDiscussed.slice(0, 3)
        : [],
    }
  } catch (error) {
    console.error('Error analyzing conversation metadata:', error)
    return {}
  }
}

/**
 * Generate conversation summary for long conversations
 * Used to replace old messages and maintain context
 */
export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  if (messages.length === 0) {
    return ''
  }

  const conversationText = messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n')

  const summaryPrompt = `Riassumi questa conversazione in modo conciso ma completo.

CONVERSAZIONE:
${conversationText}

OBIETTIVO:
- Riassumi i punti chiave discussi
- Mantieni informazioni importanti (nomi, dati, richieste)
- Indica se ci sono stati problemi o richieste specifiche
- Max 4-5 frasi

RIASSUNTO:`

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Sei un assistente che riassume conversazioni in modo conciso e preciso.',
        },
        {
          role: 'user',
          content: summaryPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    })

    return completion.choices[0]?.message?.content?.trim() || ''
  } catch (error) {
    console.error('Error summarizing conversation:', error)
    return ''
  }
}

/**
 * Progressive/Hierarchical Summarization
 * Summarizes summaries for very long conversations
 */
export async function progressiveSummarization(
  existingSummary: string,
  newMessages: Array<{ role: string; content: string }>
): Promise<string> {
  if (newMessages.length === 0) {
    return existingSummary
  }

  const newConversationText = newMessages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n')

  const progressivePrompt = `Hai un riassunto esistente di una conversazione e nuovi messaggi da integrare.

RIASSUNTO ESISTENTE:
${existingSummary}

NUOVI MESSAGGI:
${newConversationText}

COMPITO:
- Integra i nuovi messaggi nel riassunto esistente
- Mantieni le informazioni chiave dal riassunto precedente
- Aggiungi i punti importanti dai nuovi messaggi
- Elimina ridondanze
- Max 5-6 frasi totali

RIASSUNTO AGGIORNATO:`

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Sei un assistente che crea riassunti progressivi di conversazioni.',
        },
        {
          role: 'user',
          content: progressivePrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 400,
    })

    return completion.choices[0]?.message?.content?.trim() || existingSummary
  } catch (error) {
    console.error('Error in progressive summarization:', error)
    return existingSummary
  }
}

/**
 * Manage conversation context window with token-based and progressive summarization
 * Returns optimized context for next message
 */
export async function getOptimizedContext(
  messages: Array<{ role: string; content: string }>,
  options: {
    maxMessages?: number
    maxTokens?: number
    enableSummarization?: boolean
    summaryThreshold?: number
    existingSummary?: string
    enableTokenCounting?: boolean
  } = {}
): Promise<{
  contextMessages: Array<{ role: string; content: string }>
  summary?: string
  wasSummarized: boolean
  usedTokens?: number
}> {
  const {
    maxMessages = 16, // INCREASED from 8 for better context retention
    maxTokens = 6000,  // INCREASED from 3000 for more context
    enableSummarization = true,
    summaryThreshold = 6, // DECREASED from 10 for earlier summarization
    existingSummary,
    enableTokenCounting = true,
  } = options

  // Import token counter
  const { countConversationTokens, splitMessagesForSummarization, shouldSummarizeByTokens } = 
    await import('./token-counter')

  // If conversation is short, return all messages
  if (messages.length <= maxMessages) {
    const tokens = enableTokenCounting ? countConversationTokens(messages) : undefined
    return {
      contextMessages: messages,
      wasSummarized: false,
      usedTokens: tokens,
    }
  }

  // If summarization is disabled, just return recent messages
  if (!enableSummarization) {
    const recentMessages = messages.slice(-maxMessages)
    const tokens = enableTokenCounting ? countConversationTokens(recentMessages) : undefined
    return {
      contextMessages: recentMessages,
      wasSummarized: false,
      usedTokens: tokens,
    }
  }

  // Check if we should summarize based on tokens OR message count
  const shouldSummarize = 
    enableTokenCounting 
      ? shouldSummarizeByTokens(messages, maxTokens)
      : messages.length >= summaryThreshold

  if (shouldSummarize) {
    let summary: string

    // Progressive summarization: if we have existing summary, update it
    if (existingSummary) {
      console.log('📝 Using progressive summarization (updating existing summary)')
      
      // Split: messages to summarize vs keep
      const { toSummarize, toKeep } = enableTokenCounting
        ? splitMessagesForSummarization(messages, 1000)
        : {
            toSummarize: messages.slice(0, -maxMessages),
            toKeep: messages.slice(-maxMessages),
          }

      // Update existing summary with messages that weren't in it yet
      const newMessagesForSummary = toSummarize.slice(-(messages.length - summaryThreshold))
      
      if (newMessagesForSummary.length > 0) {
        summary = await progressiveSummarization(existingSummary, newMessagesForSummary)
      } else {
        summary = existingSummary // No new messages to add
      }

      const summaryMessage = {
        role: 'system',
        content: `[RIASSUNTO CONVERSAZIONE PRECEDENTE]\n${summary}`,
      }

      const contextMessages = [summaryMessage, ...toKeep]
      const tokens = enableTokenCounting ? countConversationTokens(contextMessages) : undefined

      return {
        contextMessages,
        summary,
        wasSummarized: true,
        usedTokens: tokens,
      }
    } else {
      // First-time summarization
      console.log('📝 Creating initial summary')
      
      const { toSummarize, toKeep } = enableTokenCounting
        ? splitMessagesForSummarization(messages, 1000)
        : {
            toSummarize: messages.slice(0, -maxMessages),
            toKeep: messages.slice(-maxMessages),
          }

      summary = await summarizeConversation(toSummarize)

      const summaryMessage = {
        role: 'system',
        content: `[RIASSUNTO CONVERSAZIONE PRECEDENTE]\n${summary}`,
      }

      const contextMessages = [summaryMessage, ...toKeep]
      const tokens = enableTokenCounting ? countConversationTokens(contextMessages) : undefined

      return {
        contextMessages,
        summary,
        wasSummarized: true,
        usedTokens: tokens,
      }
    }
  }

  // Default: return recent messages
  const recentMessages = messages.slice(-maxMessages)
  const tokens = enableTokenCounting ? countConversationTokens(recentMessages) : undefined
  
  return {
    contextMessages: recentMessages,
    wasSummarized: false,
    usedTokens: tokens,
  }
}

/**
 * Merge extracted user data (keep most recent, non-null values)
 */
export function mergeUserData(
  existing: ExtractedUserData,
  newData: ExtractedUserData
): ExtractedUserData {
  return {
    name: newData.name || existing.name,
    email: newData.email || existing.email,
    phone: newData.phone || existing.phone,
    company: newData.company || existing.company,
    customFields: {
      ...(existing.customFields || {}),
      ...(newData.customFields || {}),
    },
  }
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Check if conversation should be analyzed for metadata
 * (e.g., every N messages or at the end)
 */
export function shouldAnalyzeMetadata(messageCount: number): boolean {
  // Analyze at message 3, 6, 9, etc.
  return messageCount > 0 && messageCount % 3 === 0
}

/**
 * Format extracted data for display/logging
 */
export function formatExtractedData(data: ExtractedUserData): string {
  const parts: string[] = []

  if (data.name) parts.push(`Nome: ${data.name}`)
  if (data.email) parts.push(`Email: ${data.email}`)
  if (data.phone) parts.push(`Telefono: ${data.phone}`)
  if (data.company) parts.push(`Azienda: ${data.company}`)

  return parts.length > 0 ? parts.join(' | ') : 'Nessun dato estratto'
}
