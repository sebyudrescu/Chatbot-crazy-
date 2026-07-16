/**
 * Business Context System
 * 
 * Ensures the chatbot ALWAYS knows:
 * - Who the company is
 * - What the company does
 * - Main services/products
 * - Key information from website
 * 
 * This context is ALWAYS included in the prompt, even without RAG.
 */

import { prisma } from './db'
import { queryKnowledgeBase } from './rag-pipeline'

export interface BusinessContext {
  companyName: string
  companyDescription?: string
  mainServices?: string[]
  aboutUs?: string
  websiteUrl?: string
  contactInfo?: string
  keyFacts?: string[]
}

/**
 * Extract business context from the first chunks in knowledge base
 * (usually homepage/about page)
 */
export async function extractBusinessContextFromKB(
  botId: string
): Promise<Partial<BusinessContext>> {
  try {
    // Query for general business info
    const queries = [
      "Chi siamo cosa facciamo servizi",
      "about us company services products",
      "azienda descrizione"
    ]
    
    const allChunks = []
    
    for (const query of queries) {
      const chunks = await queryKnowledgeBase(botId, query, {
        topK: 10,
        minScore: 0.25  // Lower threshold for general info
      })
      allChunks.push(...chunks)
    }
    
    if (allChunks.length === 0) {
      return {}
    }
    
    // Deduplicate by text
    const uniqueChunks = Array.from(
      new Map(allChunks.map(c => [c.text, c])).values()
    )
    
    // Take top 5 most relevant
    const topChunks = uniqueChunks
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
    
    // Combine into aboutUs text
    const aboutUs = topChunks
      .map(c => c.text)
      .join('\n\n')
      .substring(0, 2000) // Limit to 2000 chars
    
    return {
      aboutUs
    }
    
  } catch (error) {
    console.error('[BusinessContext] Error extracting from KB:', error)
    return {}
  }
}

/**
 * Get complete business context for a bot
 * Combines database info + extracted KB info
 */
export async function getBusinessContext(
  botId: string
): Promise<BusinessContext> {
  try {
    const chatbot = await prisma.chatbot.findUnique({
      where: { id: botId }
    })
    
    if (!chatbot) {
      throw new Error('Chatbot not found')
    }
    
    // Start with database info
    const context: BusinessContext = {
      companyName: chatbot.companyName
    }
    
    // Try to get extracted context from KB (if available)
    if (chatbot.kbStatus === 'ready' && chatbot.kbTotalChunks > 0) {
      const extracted = await extractBusinessContextFromKB(botId)
      
      if (extracted.aboutUs) {
        context.aboutUs = extracted.aboutUs
      }
    }
    
    return context
    
  } catch (error) {
    console.error('[BusinessContext] Error getting context:', error)
    // Return minimal context
    return {
      companyName: 'l\'azienda'
    }
  }
}

/**
 * Format business context for inclusion in system prompt
 */
export function formatBusinessContextForPrompt(
  context: BusinessContext
): string {
  let prompt = `
═══════════════════════════════════════════════════════════════
🏢 INFORMAZIONI AZIENDA (IMPARA QUESTE - SONO LA TUA IDENTITÀ)
═══════════════════════════════════════════════════════════════

`
  
  // Company name (ALWAYS present)
  prompt += `**Nome Azienda:** ${context.companyName}\n\n`
  
  // About Us (if available)
  if (context.aboutUs) {
    prompt += `**Chi Siamo / Cosa Facciamo:**\n${context.aboutUs}\n\n`
  }
  
  // Services (if available)
  if (context.mainServices && context.mainServices.length > 0) {
    prompt += `**Servizi/Prodotti Principali:**\n`
    context.mainServices.forEach(service => {
      prompt += `• ${service}\n`
    })
    prompt += '\n'
  }
  
  // Contact info (if available)
  if (context.contactInfo) {
    prompt += `**Contatti:**\n${context.contactInfo}\n\n`
  }
  
  prompt += `---

**IMPORTANTE:**
Quando qualcuno chiede "Chi siete?" o "Cosa fate?", rispondi usando QUESTE informazioni.

Esempio risposta:
"Sono l'assistente virtuale di ${context.companyName}${context.aboutUs ? '. ' + context.aboutUs.split('\n')[0].substring(0, 100) + '...' : ''}

Come posso aiutarti oggi?"

NON dire solo "Sono un assistente supporto clienti".
Devi SEMPRE menzionare ${context.companyName} e cosa facciamo.
═══════════════════════════════════════════════════════════════

`
  
  return prompt
}

/**
 * Cache business context per bot (avoid re-querying every time)
 */
const contextCache = new Map<string, { context: BusinessContext, timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getCachedBusinessContext(
  botId: string,
  forceRefresh = false
): Promise<BusinessContext> {
  const now = Date.now()
  const cached = contextCache.get(botId)
  
  // Return cached if valid
  if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.context
  }
  
  // Fetch fresh
  const context = await getBusinessContext(botId)
  
  // Cache it
  contextCache.set(botId, {
    context,
    timestamp: now
  })
  
  return context
}
