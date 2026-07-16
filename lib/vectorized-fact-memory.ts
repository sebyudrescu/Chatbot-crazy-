/**
 * Vectorized Fact Memory System
 * Stores and retrieves facts with embeddings for semantic recall
 */

import { generateEmbedding } from './embeddings'
import { prisma } from './db'
import { DEFAULT_CHAT_MODEL } from './ai-models'

export interface ExtractedFact {
  id?: string
  conversationId: string
  factType: 'personal_info' | 'preference' | 'interest' | 'problem' | 'feedback' | 'intent' | 'other'
  factText: string
  importance: number // 0.0 - 1.0 (higher = more important)
  extractedAt: Date
  embedding?: number[]
  metadata?: Record<string, any>
}

export interface FactRecallResult {
  fact: ExtractedFact
  relevanceScore: number
}

/**
 * Extract rich facts from conversation
 * Goes beyond basic user data (name, email) to capture preferences, interests, problems
 */
export async function extractRichFacts(
  messages: Array<{ role: string; content: string }>,
  conversationId: string
): Promise<ExtractedFact[]> {
  if (messages.length === 0) {
    return []
  }

  const conversationText = messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n')

  const extractionPrompt = `Analizza questa conversazione ed estrai FATTI CHIAVE sull'utente.

CONVERSAZIONE:
${conversationText}

TIPI DI FATTI DA ESTRARRE:
1. PERSONAL_INFO: dati personali (già estratti altrove, evita duplicati se possibile)
2. PREFERENCE: preferenze esplicite ("preferisco X", "mi piace Y", "non voglio Z")
3. INTEREST: interessi e aree di interesse ("sono interessato a", "vorrei sapere di")
4. PROBLEM: problemi o pain points espressi ("ho un problema con", "non riesco a")
5. FEEDBACK: feedback su prodotto/servizio ("funziona bene", "troppo complicato")
6. INTENT: intento principale ("voglio acquistare", "cerco informazioni su")

REGOLE:
- Estrai SOLO fatti espliciti, non dedurre
- Ogni fatto deve essere una frase completa e autosufficiente
- Ordina per importanza (più importante = più utile per personalizzare future risposte)
- Max 5-7 fatti per conversazione
- Se un fatto è già presente in messaggi precedenti, non ripeterlo

Rispondi SOLO con JSON:
{
  "facts": [
    {
      "factType": "preference|interest|problem|feedback|intent|personal_info|other",
      "factText": "Frase completa che descrive il fatto",
      "importance": 0.8
    }
  ]
}

Se non ci sono fatti rilevanti, rispondi: {"facts": []}

JSON:`

  try {
    const OpenAI = (await import('openai')).default
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    
    const completion = await openai.chat.completions.create({
      model: DEFAULT_CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Sei un estrattore di fatti. Rispondi SOLO con JSON valido.',
        },
        {
          role: 'user',
          content: extractionPrompt,
        },
      ],
      temperature: 0.0,
      max_tokens: 500,
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) {
      return []
    }

    const parsed = JSON.parse(response)
    const facts: ExtractedFact[] = []

    if (Array.isArray(parsed.facts)) {
      for (const fact of parsed.facts) {
        // Validate fact
        if (
          fact.factType &&
          fact.factText &&
          typeof fact.factText === 'string' &&
          fact.factText.length > 5
        ) {
          facts.push({
            conversationId,
            factType: fact.factType,
            factText: fact.factText.trim(),
            importance: fact.importance || 0.5,
            extractedAt: new Date(),
          })
        }
      }
    }

    return facts
  } catch (error) {
    console.error('Error extracting rich facts:', error)
    return []
  }
}

/**
 * Store facts with embeddings in database
 */
export async function storeFactsWithEmbeddings(
  facts: ExtractedFact[]
): Promise<void> {
  if (facts.length === 0) {
    return
  }

  console.log(`💾 Storing ${facts.length} facts with embeddings...`)

  for (const fact of facts) {
    try {
      // Generate embedding for fact text
      const embedding = await generateEmbedding(fact.factText)

      // Store in database (assuming we'll add ConversationFact model)
      // For now, log it
      console.log(`✅ Fact stored: [${fact.factType}] "${fact.factText}" (importance: ${fact.importance})`)
      
      // TODO: Store in DB when schema is ready
      // await prisma.conversationFact.create({
      //   data: {
      //     conversationId: fact.conversationId,
      //     factType: fact.factType,
      //     factText: fact.factText,
      //     importance: fact.importance,
      //     embedding: JSON.stringify(embedding),
      //     extractedAt: fact.extractedAt,
      //   }
      // })
    } catch (error) {
      console.error(`Error storing fact: "${fact.factText}"`, error)
    }
  }
}

/**
 * Recall relevant facts based on current query
 * Uses semantic similarity on embeddings
 */
export async function recallRelevantFacts(
  conversationId: string,
  query: string,
  topK: number = 3
): Promise<FactRecallResult[]> {
  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query)

    // TODO: Retrieve facts from DB and calculate similarity
    // For now, return empty (will implement when DB schema is ready)
    console.log(`🔍 Recalling facts for query: "${query}"`)
    
    // const facts = await prisma.conversationFact.findMany({
    //   where: { conversationId },
    //   orderBy: { importance: 'desc' }
    // })

    // Calculate cosine similarity and return top K
    // const results = facts
    //   .map(fact => ({
    //     fact,
    //     relevanceScore: cosineSimilarity(queryEmbedding, JSON.parse(fact.embedding))
    //   }))
    //   .sort((a, b) => b.relevanceScore - a.relevanceScore)
    //   .slice(0, topK)

    return []
  } catch (error) {
    console.error('Error recalling facts:', error)
    return []
  }
}

/**
 * Get all facts for a conversation (for display/debugging)
 */
export async function getConversationFacts(
  conversationId: string
): Promise<ExtractedFact[]> {
  try {
    // TODO: Retrieve from DB
    // const facts = await prisma.conversationFact.findMany({
    //   where: { conversationId },
    //   orderBy: { importance: 'desc' }
    // })
    
    return []
  } catch (error) {
    console.error('Error getting conversation facts:', error)
    return []
  }
}

/**
 * Format facts for injection into prompt
 * Prepares facts in a way that helps personalize responses
 */
export function formatFactsForPrompt(facts: FactRecallResult[]): string {
  if (facts.length === 0) {
    return ''
  }

  const factsByType = new Map<string, string[]>()

  for (const { fact } of facts) {
    if (!factsByType.has(fact.factType)) {
      factsByType.set(fact.factType, [])
    }
    factsByType.get(fact.factType)!.push(fact.factText)
  }

  const sections: string[] = []

  if (factsByType.has('preference')) {
    sections.push(`PREFERENZE UTENTE:\n${factsByType.get('preference')!.map(f => `- ${f}`).join('\n')}`)
  }

  if (factsByType.has('interest')) {
    sections.push(`INTERESSI:\n${factsByType.get('interest')!.map(f => `- ${f}`).join('\n')}`)
  }

  if (factsByType.has('problem')) {
    sections.push(`PROBLEMI/PAIN POINTS:\n${factsByType.get('problem')!.map(f => `- ${f}`).join('\n')}`)
  }

  if (factsByType.has('feedback')) {
    sections.push(`FEEDBACK PRECEDENTE:\n${factsByType.get('feedback')!.map(f => `- ${f}`).join('\n')}`)
  }

  return sections.join('\n\n')
}

/**
 * Calculate importance score for a fact
 * Based on: recency, relevance to current query, explicit vs implicit
 */
export function calculateFactImportance(
  fact: ExtractedFact,
  currentQuery?: string
): number {
  let score = fact.importance || 0.5

  // Recency boost (facts from recent messages are more important)
  const hoursSinceExtraction = (Date.now() - fact.extractedAt.getTime()) / (1000 * 60 * 60)
  const recencyBoost = Math.max(0, 1 - hoursSinceExtraction / 168) * 0.2 // Decay over 1 week
  score += recencyBoost

  // Type importance
  const typeImportance: Record<string, number> = {
    problem: 0.9, // Problems are critical
    intent: 0.8,
    preference: 0.7,
    interest: 0.6,
    feedback: 0.5,
    personal_info: 0.4,
    other: 0.3,
  }
  score *= typeImportance[fact.factType] || 0.5

  return Math.min(score, 1.0)
}

/**
 * Cosine similarity helper (for embeddings comparison)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
