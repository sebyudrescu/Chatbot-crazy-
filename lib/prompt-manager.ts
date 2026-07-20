/**
 * Prompt Manager - Handles system prompt generation for chatbots
 * Integrates prompt templates with chatbot configuration
 */

import { getTemplateById, fillTemplatePlaceholders } from './prompt-templates'
import { appendAgentInstructions, type AgentInstructionConfig } from './agent-instructions'

export interface ChatbotPromptConfig extends AgentInstructionConfig {
  promptTemplateId?: string | null
  systemPrompt?: string | null
  promptVariables?: Record<string, string> | null
  companyName: string
}

/**
 * Generate the final system prompt for a chatbot
 * Priority: Custom systemPrompt > Template with variables > Default template
 */
export function generateSystemPrompt(config: ChatbotPromptConfig): string {
  // 1. If custom systemPrompt is provided, use it directly
  if (config.systemPrompt && config.systemPrompt.trim()) {
    return appendAgentInstructions(config.systemPrompt, config)
  }

  // 2. If template ID is provided, use the template
  if (config.promptTemplateId) {
    const template = getTemplateById(config.promptTemplateId)
    if (template) {
      // Prepare variables with defaults
      const variables: Record<string, string> = {
        COMPANY_NAME: config.companyName,
        ...(config.promptVariables || {}),
      }
      
      // Fill placeholders
      return appendAgentInstructions(fillTemplatePlaceholders(template.systemPrompt, variables), config)
    }
  }

  // 3. Fallback to default customer support template
  const defaultTemplate = getTemplateById('customer-support')
  if (defaultTemplate) {
    const variables = {
      COMPANY_NAME: config.companyName,
      ...(config.promptVariables || {}),
    }
    return appendAgentInstructions(fillTemplatePlaceholders(defaultTemplate.systemPrompt, variables), config)
  }

  // 4. Ultimate fallback (should never reach here)
  return appendAgentInstructions(`Sei un assistente AI professionale per ${config.companyName}.

Rispondi sempre basandoti ESCLUSIVAMENTE sulle informazioni fornite nella knowledge base.
Non inventare informazioni. Se non sai qualcosa, ammettilo onestamente.

Mantieni un tono professionale, cortese e utile.`, config)
}

/**
 * Validate if a prompt template exists
 */
export function isValidTemplateId(templateId: string): boolean {
  return getTemplateById(templateId) !== undefined
}

/**
 * Get required placeholders for a template
 */
export function getTemplatePlaceholders(templateId: string): string[] {
  const template = getTemplateById(templateId)
  return template?.placeholders || []
}

/**
 * Build RAG-enhanced system prompt with context
 * This adds RAG-specific instructions to the base system prompt
 * 
 * @deprecated Use buildConfidenceAwareRAGPrompt instead for adaptive safety
 */
export function buildRAGSystemPrompt(
  basePrompt: string,
  contextSources: { id: string; content: string; relevance: number }[]
): string {
  const hasContext = contextSources.length > 0

  let ragPrompt = basePrompt + '\n\n'

  if (hasContext) {
    ragPrompt += `---

# CONTESTO DALLA KNOWLEDGE BASE

Le seguenti informazioni sono state recuperate dalla knowledge base e sono rilevanti per la domanda corrente.
Usa SOLO queste informazioni per rispondere:

`
    contextSources.forEach((source, index) => {
      ragPrompt += `[Fonte ${index + 1}] (Rilevanza: ${(source.relevance * 100).toFixed(0)}%)
${source.content}

`
    })

    ragPrompt += `---

IMPORTANTE: Rispondi basandoti ESCLUSIVAMENTE sulle fonti sopra riportate.
Se la risposta non è presente nelle fonti, dillo chiaramente all'utente.
Cita sempre la fonte quando fornisci informazioni: [Fonte 1], [Fonte 2], etc.`
  } else {
    ragPrompt += `---

# NESSUN CONTESTO DISPONIBILE

Non sono state trovate informazioni rilevanti nella knowledge base per questa domanda.

Devi rispondere:
"Mi dispiace, non ho informazioni nella knowledge base per rispondere a questa domanda. 
Posso aiutarti con qualcos'altro o indirizzarti al supporto diretto?"

NON inventare informazioni. NON usare conoscenze esterne.`
  }

  return ragPrompt
}

/**
 * Build confidence-aware RAG system prompt
 * Adapts prompt restrictiveness based on retrieval confidence
 */
export function buildConfidenceAwareRAGPrompt(
  basePrompt: string,
  contextSources: { id: string; content: string; relevance: number }[],
  confidenceScore: number,
  companyName?: string
): { prompt: string; temperature: number; maxTokens: number } {
  // Import here to avoid circular dependency
  const {
    getConfidenceLevel,
    buildConfidenceAwarePrompt,
    getConfidenceAwareTemperature,
    getConfidenceAwareMaxTokens
  } = require('./confidence-aware-prompts')

  // Determine confidence level
  const confidenceLevel = getConfidenceLevel(confidenceScore)

  // Build context section
  let contextSection = ''
  if (contextSources.length > 0) {
    contextSection = `
═══════════════════════════════════════════════════════════════
📚 RETRIEVED KNOWLEDGE BASE CONTEXT
═══════════════════════════════════════════════════════════════

`
    contextSources.forEach((source, index) => {
      contextSection += `[Source ${index + 1}] (Relevance: ${(source.relevance * 100).toFixed(0)}%)
${source.content}

---

`
    })

    contextSection += `
Use ONLY the information above to answer. Cite sources using [Source N].
`
  } else {
    contextSection = `
═══════════════════════════════════════════════════════════════
📚 KNOWLEDGE BASE CONTEXT
═══════════════════════════════════════════════════════════════

⚠️ NO RELEVANT INFORMATION FOUND

You MUST NOT attempt to answer this question.
Offer escalation immediately.
`
  }

  // Build confidence-aware prompt
  const adaptivePrompt = buildConfidenceAwarePrompt({
    baseSystemPrompt: basePrompt,
    confidenceLevel,
    confidenceScore,
    retrievedSourcesCount: contextSources.length,
    companyName
  })

  // Combine everything
  const finalPrompt = `${adaptivePrompt}

${contextSection}`

  return {
    prompt: finalPrompt,
    temperature: getConfidenceAwareTemperature(confidenceLevel),
    maxTokens: getConfidenceAwareMaxTokens(confidenceLevel)
  }
}
