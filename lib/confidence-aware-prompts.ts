/**
 * Confidence-Aware Prompt System
 * 
 * Dynamically adjusts prompt restrictiveness based on retrieval confidence.
 * Low confidence = More restrictive prompts = Safer responses
 * 
 * This prevents hallucinations by forcing conservative behavior when
 * the system is uncertain about the retrieved information quality.
 */

export enum ConfidenceLevel {
  VERY_HIGH = 'very_high',  // > 0.85
  HIGH = 'high',            // 0.75 - 0.85
  MEDIUM = 'medium',        // 0.65 - 0.75
  LOW = 'low',              // 0.50 - 0.65
  VERY_LOW = 'very_low',    // < 0.50
  NONE = 'none'             // No results
}

export interface ConfidenceThresholds {
  veryHigh: number
  high: number
  medium: number
  low: number
}

export interface AdaptivePromptConfig {
  baseSystemPrompt: string
  confidenceLevel: ConfidenceLevel
  confidenceScore: number
  retrievedSourcesCount: number
  companyName?: string
}

/**
 * Determine confidence level from score
 */
export function getConfidenceLevel(
  score: number,
  thresholds: ConfidenceThresholds = {
    veryHigh: 0.85,
    high: 0.75,
    medium: 0.65,
    low: 0.50
  }
): ConfidenceLevel {
  if (score >= thresholds.veryHigh) return ConfidenceLevel.VERY_HIGH
  if (score >= thresholds.high) return ConfidenceLevel.HIGH
  if (score >= thresholds.medium) return ConfidenceLevel.MEDIUM
  if (score >= thresholds.low) return ConfidenceLevel.LOW
  if (score > 0) return ConfidenceLevel.VERY_LOW
  return ConfidenceLevel.NONE
}

/**
 * Generate confidence-aware instructions that get injected into the prompt
 * These instructions become progressively MORE restrictive as confidence drops
 */
export function generateConfidenceInstructions(
  confidenceLevel: ConfidenceLevel,
  confidenceScore: number,
  sourcesCount: number
): string {
  const instructions: Record<ConfidenceLevel, string> = {
    [ConfidenceLevel.VERY_HIGH]: `
📊 CONFIDENCE LEVEL: VERY HIGH (${Math.round(confidenceScore * 100)}%)

You have ${sourcesCount} highly relevant source(s). You can:
✅ Provide detailed, comprehensive answers
✅ Make reasonable inferences based on the sources
✅ Offer additional context and explanations
✅ Suggest related topics or follow-up actions

RULES:
- Base your answer on the provided sources
- You may combine information from multiple sources
- You may explain concepts in depth
- Cite sources using [Source N] notation
- If asked about something not in sources, state it clearly
`,

    [ConfidenceLevel.HIGH]: `
📊 CONFIDENCE LEVEL: HIGH (${Math.round(confidenceScore * 100)}%)

You have ${sourcesCount} relevant source(s). You can:
✅ Provide clear, direct answers from the sources
✅ Combine information if clearly related
✅ Offer brief context when helpful
⚠️ Avoid making broad inferences

RULES:
- Stick closely to the information in the sources
- Be more conservative with interpretations
- Always cite sources [Source N]
- If uncertain, acknowledge it explicitly
- Offer human escalation if answer is incomplete
`,

    [ConfidenceLevel.MEDIUM]: `
📊 CONFIDENCE LEVEL: MEDIUM (${Math.round(confidenceScore * 100)}%)

⚠️ Retrieved information has moderate confidence.

RESTRICTIVE MODE - You MUST:
✅ Quote directly from sources when possible
✅ Clearly distinguish facts from sources vs. your interpretations
✅ Use cautious language ("Based on the documentation...", "According to the source...")
✅ Acknowledge limitations explicitly
⚠️ DO NOT make inferences beyond what's explicitly stated
⚠️ DO NOT combine information unless directly related

MANDATORY PHRASES:
- "Based on the available information..."
- "According to the documentation..."
- "I can confirm that..."
- "However, I'm not certain about..."

If you're uncertain about ANY part of your answer:
→ Say: "I'm not fully confident about this. Would you like me to connect you with a specialist?"
`,

    [ConfidenceLevel.LOW]: `
📊 CONFIDENCE LEVEL: LOW (${Math.round(confidenceScore * 100)}%)

🚨 HIGHLY RESTRICTIVE MODE ACTIVATED

Retrieved information has LOW confidence. You MUST be extremely cautious.

STRICT RULES:
✅ Only provide information that is EXPLICITLY stated in sources
✅ Use direct quotes when possible
✅ Preface every statement with "According to the sources I found..."
✅ Acknowledge uncertainty at the start of your response
❌ NO inferences whatsoever
❌ NO interpretation beyond literal meaning
❌ NO combining of information
❌ NO additional context or explanations

REQUIRED FORMAT:
"I found some information, but I'm not highly confident it fully answers your question.

[Quote or paraphrase from source]

⚠️ Given the uncertainty, I recommend:
- Contacting our support team for a more accurate answer
- Let me connect you with a specialist who can help better"

ESCALATION: Strongly suggest human escalation in your response.
`,

    [ConfidenceLevel.VERY_LOW]: `
📊 CONFIDENCE LEVEL: VERY LOW (${Math.round(confidenceScore * 100)}%)

🚨 EMERGENCY RESTRICTIVE MODE 🚨

Retrieved information is highly uncertain. DO NOT attempt a full answer.

YOU MUST:
1. Acknowledge you found limited/uncertain information
2. Briefly mention what you found (if anything relevant)
3. IMMEDIATELY recommend human escalation

MANDATORY RESPONSE FORMAT:
"I found some information, but I'm not confident it accurately addresses your question:

[Very brief mention of what was found, if relevant]

❌ I cannot provide a reliable answer based on this information.

✅ Let me connect you with our support team who can give you an accurate answer.
   Would you like me to escalate this to a specialist?"

DO NOT:
❌ Attempt to answer the question directly
❌ Make any inferences or interpretations
❌ Provide details beyond a brief mention
❌ Offer suggestions or advice

ONLY purpose: Acknowledge limitation and offer escalation.
`,

    [ConfidenceLevel.NONE]: `
📊 CONFIDENCE LEVEL: NONE

🚨 NO RELEVANT INFORMATION FOUND 🚨

CRITICAL INSTRUCTION: You MUST NOT attempt to answer this question.

MANDATORY RESPONSE:
"I apologize, but I don't have any relevant information in my knowledge base to answer this question.

To get you the help you need, I recommend:
1. ✅ Let me connect you with our support team who can assist directly
2. 📧 Contact us through our official support channels
3. 🔄 Try rephrasing your question if you think there might be relevant information

Would you like me to escalate this to a specialist now?"

ABSOLUTE PROHIBITIONS:
❌ DO NOT use general knowledge
❌ DO NOT make educated guesses
❌ DO NOT try to be helpful by providing external information
❌ DO NOT offer solutions not in the knowledge base

Your ONLY job: Acknowledge the gap and offer escalation.
`
  }

  return instructions[confidenceLevel]
}

/**
 * Build complete confidence-aware system prompt
 * Combines base prompt with confidence-specific instructions
 */
export function buildConfidenceAwarePrompt(config: AdaptivePromptConfig): string {
  const {
    baseSystemPrompt,
    confidenceLevel,
    confidenceScore,
    retrievedSourcesCount,
    companyName = 'our company'
  } = config

  // Get confidence-specific instructions
  const confidenceInstructions = generateConfidenceInstructions(
    confidenceLevel,
    confidenceScore,
    retrievedSourcesCount
  )

  // Build the complete prompt
  const enhancedPrompt = `
${baseSystemPrompt}

═══════════════════════════════════════════════════════════════
🎯 ADAPTIVE SAFETY SYSTEM - ACTIVE
═══════════════════════════════════════════════════════════════

${confidenceInstructions}

═══════════════════════════════════════════════════════════════
⚖️ TRUST & SAFETY PRINCIPLES
═══════════════════════════════════════════════════════════════

1. **ACCURACY OVER HELPFULNESS**
   Better to say "I don't know" than to provide uncertain information.
   User trust is more valuable than appearing knowledgeable.

2. **CONFIDENCE-PROPORTIONAL RESPONSES**
   Your response style MUST match the confidence level:
   - High confidence → Helpful and detailed
   - Medium confidence → Cautious and clear
   - Low confidence → Minimal with escalation offer
   - Very low/None → Escalation only

3. **ESCALATION IS A FEATURE, NOT A FAILURE**
   Offering human help is the RIGHT thing to do when uncertain.
   It builds trust and ensures users get accurate information.

4. **CITATION IS MANDATORY**
   Every factual claim MUST reference a source [Source N].
   If you can't cite it, you can't say it.

5. **UNCERTAINTY ACKNOWLEDGMENT**
   When in doubt, explicitly state your uncertainty level.
   Use phrases like:
   - "I'm not entirely certain, but..."
   - "Based on limited information..."
   - "To ensure accuracy, I recommend..."

═══════════════════════════════════════════════════════════════

Remember: You represent ${companyName}. Accuracy and trust are paramount.
When confidence is low, being conservative protects both the user and the company.

`.trim()

  return enhancedPrompt
}

/**
 * Generate response guidelines based on confidence
 * These are shorter reminders that can be appended to prompts
 */
export function getResponseGuidelines(confidenceLevel: ConfidenceLevel): string {
  const guidelines: Record<ConfidenceLevel, string> = {
    [ConfidenceLevel.VERY_HIGH]: 
      'Respond naturally and helpfully. Cite sources.',
    
    [ConfidenceLevel.HIGH]: 
      'Respond clearly but stay close to sources. Cite everything.',
    
    [ConfidenceLevel.MEDIUM]: 
      'Be cautious. Use qualifying language. Cite sources. Acknowledge limitations.',
    
    [ConfidenceLevel.LOW]: 
      'Be very conservative. Quote sources. Strongly suggest escalation.',
    
    [ConfidenceLevel.VERY_LOW]: 
      'Minimal response. Brief acknowledgment. Immediate escalation offer.',
    
    [ConfidenceLevel.NONE]: 
      'No answer attempt. Escalation only. No speculation.'
  }

  return guidelines[confidenceLevel]
}

/**
 * Determine if response should be blocked entirely
 * Returns true if confidence is too low to safely respond
 */
export function shouldBlockResponse(
  confidenceLevel: ConfidenceLevel,
  strictMode: boolean = false
): boolean {
  if (strictMode) {
    // In strict mode, block MEDIUM and below
    return [
      ConfidenceLevel.MEDIUM,
      ConfidenceLevel.LOW,
      ConfidenceLevel.VERY_LOW,
      ConfidenceLevel.NONE
    ].includes(confidenceLevel)
  }

  // In normal mode, only block VERY_LOW and NONE
  return [
    ConfidenceLevel.VERY_LOW,
    ConfidenceLevel.NONE
  ].includes(confidenceLevel)
}

/**
 * Generate escalation message for blocked responses
 */
export function generateEscalationMessage(
  confidenceLevel: ConfidenceLevel,
  confidenceScore: number,
  companyName?: string
): string {
  const company = companyName || 'our team'

  return `I apologize, but I don't have sufficient reliable information to answer this question accurately (confidence: ${Math.round(confidenceScore * 100)}%).

Rather than risk providing incorrect information, I'd like to connect you with ${company}'s support team who can give you an accurate, detailed answer.

Would you like me to:
1. ✅ Escalate this to a specialist now
2. 📧 Provide you with direct contact information
3. 🔄 Help you rephrase the question to search again

Your trust is important to us, and we want to ensure you get the right information.`
}

/**
 * Analyze response text to check if it follows confidence guidelines
 * Useful for testing and quality assurance
 */
export function analyzeResponseCompliance(
  responseText: string,
  confidenceLevel: ConfidenceLevel
): {
  compliant: boolean
  issues: string[]
  suggestions: string[]
} {
  const issues: string[] = []
  const suggestions: string[] = []

  const hasSourceCitation = /\[Source \d+\]/i.test(responseText)
  const hasUncertaintyLanguage = /(not certain|not sure|limited information|may not|might not)/i.test(responseText)
  const hasEscalationOffer = /(escalate|specialist|support team|connect you)/i.test(responseText)
  const hasCautiousLanguage = /(based on|according to|appears to|seems to)/i.test(responseText)

  // Check compliance based on confidence level
  switch (confidenceLevel) {
    case ConfidenceLevel.VERY_HIGH:
    case ConfidenceLevel.HIGH:
      if (!hasSourceCitation) {
        issues.push('Missing source citations')
        suggestions.push('Add [Source N] references')
      }
      break

    case ConfidenceLevel.MEDIUM:
      if (!hasSourceCitation) {
        issues.push('Missing source citations (critical at medium confidence)')
      }
      if (!hasCautiousLanguage) {
        issues.push('Should use cautious language')
        suggestions.push('Use phrases like "Based on..." or "According to..."')
      }
      if (!hasUncertaintyLanguage) {
        suggestions.push('Consider acknowledging limitations')
      }
      break

    case ConfidenceLevel.LOW:
      if (!hasSourceCitation) {
        issues.push('MUST cite sources at low confidence')
      }
      if (!hasUncertaintyLanguage) {
        issues.push('MUST acknowledge uncertainty')
      }
      if (!hasEscalationOffer) {
        issues.push('MUST offer escalation at low confidence')
      }
      break

    case ConfidenceLevel.VERY_LOW:
    case ConfidenceLevel.NONE:
      if (!hasEscalationOffer) {
        issues.push('CRITICAL: Must offer escalation - cannot answer at this confidence')
      }
      if (responseText.length > 500) {
        issues.push('Response too detailed for very low confidence')
        suggestions.push('Keep response minimal, focus on escalation')
      }
      break
  }

  return {
    compliant: issues.length === 0,
    issues,
    suggestions
  }
}

/**
 * Get recommended temperature based on confidence
 * Lower confidence = Lower temperature (more deterministic)
 */
export function getConfidenceAwareTemperature(confidenceLevel: ConfidenceLevel): number {
  const temperatures: Record<ConfidenceLevel, number> = {
    [ConfidenceLevel.VERY_HIGH]: 0.7,  // Normal creativity
    [ConfidenceLevel.HIGH]: 0.5,       // Slightly more conservative
    [ConfidenceLevel.MEDIUM]: 0.3,     // Conservative
    [ConfidenceLevel.LOW]: 0.2,        // Very conservative
    [ConfidenceLevel.VERY_LOW]: 0.1,   // Extremely deterministic
    [ConfidenceLevel.NONE]: 0.0        // Completely deterministic
  }

  return temperatures[confidenceLevel]
}

/**
 * Get recommended max tokens based on confidence
 * Lower confidence = Shorter responses
 */
export function getConfidenceAwareMaxTokens(confidenceLevel: ConfidenceLevel): number {
  const maxTokens: Record<ConfidenceLevel, number> = {
    [ConfidenceLevel.VERY_HIGH]: 800,  // Full detailed response
    [ConfidenceLevel.HIGH]: 600,       // Detailed but focused
    [ConfidenceLevel.MEDIUM]: 400,     // Moderate length
    [ConfidenceLevel.LOW]: 250,        // Brief response
    [ConfidenceLevel.VERY_LOW]: 150,   // Minimal response
    [ConfidenceLevel.NONE]: 100        // Escalation only
  }

  return maxTokens[confidenceLevel]
}

/**
 * Export complete configuration for a confidence level
 */
export interface ConfidenceAwareConfig {
  promptInstructions: string
  temperature: number
  maxTokens: number
  shouldBlock: boolean
  responseGuidelines: string
}

export function getCompleteConfig(
  confidenceLevel: ConfidenceLevel,
  confidenceScore: number,
  sourcesCount: number,
  strictMode: boolean = false
): ConfidenceAwareConfig {
  return {
    promptInstructions: generateConfidenceInstructions(
      confidenceLevel,
      confidenceScore,
      sourcesCount
    ),
    temperature: getConfidenceAwareTemperature(confidenceLevel),
    maxTokens: getConfidenceAwareMaxTokens(confidenceLevel),
    shouldBlock: shouldBlockResponse(confidenceLevel, strictMode),
    responseGuidelines: getResponseGuidelines(confidenceLevel)
  }
}
