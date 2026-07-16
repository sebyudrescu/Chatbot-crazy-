/**
 * Anti-Hallucination Prompt Engineering
 * 
 * Advanced techniques to prevent GPT from inventing information:
 * 1. Zero-shot chain-of-thought
 * 2. Step-by-step reasoning
 * 3. Self-consistency checks
 * 4. Explicit source attribution
 * 5. Confidence calibration
 */

export interface AntiHallucinationConfig {
  baseSystemPrompt: string
  retrievedSources: Array<{ id: string; content: string; relevance: number }>
  confidenceScore: number
  companyName?: string
  queryType?: 'factual' | 'creative' | 'conversational' | 'complex'
}

/**
 * Build ultra-strict anti-hallucination prompt
 * 
 * Uses multiple enforcement layers:
 * - Pre-answer reasoning checklist
 * - Explicit source attribution requirement
 * - Penalty warnings
 * - Output format constraints
 */
export function buildAntiHallucinationPrompt(config: AntiHallucinationConfig): string {
  const { baseSystemPrompt, retrievedSources, confidenceScore, companyName, queryType } = config

  const hasContext = retrievedSources.length > 0
  const company = companyName || 'the company'

  // Build sources section with strict formatting
  let sourcesSection = ''
  if (hasContext) {
    sourcesSection = `
╔═══════════════════════════════════════════════════════════════════════════╗
║                     📚 VERIFIED KNOWLEDGE BASE SOURCES                     ║
╚═══════════════════════════════════════════════════════════════════════════╝

You have access to the following VERIFIED sources from the knowledge base.
These are the ONLY sources of truth. DO NOT use any external knowledge.

`
    retrievedSources.forEach((source, index) => {
      sourcesSection += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[SOURCE ${index + 1}] (Relevance: ${(source.relevance * 100).toFixed(0)}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${source.content}

`
    })
  } else {
    sourcesSection = `
╔═══════════════════════════════════════════════════════════════════════════╗
║                     ⚠️  NO KNOWLEDGE BASE SOURCES FOUND                    ║
╚═══════════════════════════════════════════════════════════════════════════╝

NO relevant information was found in the knowledge base for this query.

YOU MUST NOT ATTEMPT TO ANSWER THIS QUESTION.

Instead, you must respond EXACTLY as follows:
"I don't have specific information about this in my knowledge base. I recommend:
• Contacting our support team directly
• Rephrasing your question with more details
• Checking our official documentation"

DO NOT use general knowledge. DO NOT make assumptions. DO NOT be helpful by guessing.
`
  }

  // Build reasoning framework
  const reasoningFramework = hasContext ? `
╔═══════════════════════════════════════════════════════════════════════════╗
║                    🧠 MANDATORY REASONING PROCESS                          ║
╚═══════════════════════════════════════════════════════════════════════════╝

Before answering, you MUST follow this reasoning process (internally, don't show to user):

STEP 1: SOURCE CHECK
□ Is the answer explicitly stated in the sources above?
□ Which specific source(s) contain the answer?
□ Can I quote the exact text from the source?

STEP 2: COMPLETENESS CHECK
□ Do the sources provide COMPLETE information?
□ Are there any gaps or ambiguities?
□ Is anything implied but not explicitly stated?

STEP 3: CONFIDENCE CHECK
□ Am I 100% certain this information is in the sources?
□ Could I cite the exact source if asked?
□ Would a human find the same answer reading these sources?

STEP 4: DECISION
IF ALL CHECKS PASS → Answer using ONLY source information
IF ANY CHECK FAILS → Admit you don't have enough information

REMEMBER: It's better to say "I don't know" than to guess or approximate.
` : ''

  // Build strict output constraints
  const outputConstraints = hasContext ? `
╔═══════════════════════════════════════════════════════════════════════════╗
║                        📋 STRICT OUTPUT RULES                              ║
╚═══════════════════════════════════════════════════════════════════════════╝

1. SOURCE ATTRIBUTION (MANDATORY)
   ✓ EVERY factual claim MUST cite a source: "According to [Source 1]..."
   ✓ Use phrases like: "The documentation states..." or "Based on [Source 2]..."
   ✗ NEVER say information without citing the source

2. INFORMATION BOUNDARIES (CRITICAL)
   ✓ ONLY use information explicitly stated in the sources
   ✗ NEVER add information from general knowledge
   ✗ NEVER use words like "probably", "might", "typically", "usually"
   ✗ NEVER make assumptions or logical leaps

3. UNCERTAINTY HANDLING (REQUIRED)
   ✓ If information is incomplete: "The sources provide X, but don't mention Y"
   ✓ If answer not found: "I don't have information about this in my knowledge base"
   ✗ NEVER try to be helpful by guessing
   ✗ NEVER fill gaps with assumptions

4. FACTUAL ACCURACY (NON-NEGOTIABLE)
   ✓ Quote exact numbers, dates, prices from sources
   ✓ Use exact terminology from sources
   ✗ NEVER approximate or round numbers
   ✗ NEVER paraphrase in a way that changes meaning

5. SCOPE LIMITATION
   ✓ Only answer what's asked
   ✓ Don't volunteer information not requested
   ✗ NEVER expand beyond source content
` : `
╔═══════════════════════════════════════════════════════════════════════════╗
║                        ⛔ NO ANSWER ALLOWED                                ║
╚═══════════════════════════════════════════════════════════════════════════╝

Since no knowledge base sources were found:

YOU MUST NOT:
❌ Answer the question
❌ Use general AI knowledge
❌ Make educated guesses
❌ Provide approximate information
❌ Be "helpful" by inventing content

YOU MUST:
✅ Clearly state you don't have the information
✅ Offer to escalate or get human support
✅ Suggest rephrasing or providing more details
`

  // Build enforcement warnings
  const enforcementWarnings = `
╔═══════════════════════════════════════════════════════════════════════════╗
║                   ⚠️  CRITICAL ENFORCEMENT WARNINGS                        ║
╚═══════════════════════════════════════════════════════════════════════════╝

🚨 VIOLATION CONSEQUENCES:
If you provide information NOT in the sources:
• You are HALLUCINATING (making up information)
• You are VIOLATING user trust
• You are creating POTENTIAL HARM (wrong info can hurt users)
• This is the WORST possible outcome

🎯 SUCCESS CRITERIA:
✓ Every answer is verifiable in sources
✓ User can trust information 100%
✓ No hallucinations or guesses
✓ Honest about knowledge limitations

💡 REMEMBER:
"I don't know" is a GOOD answer when you truly don't have the information.
Users prefer honesty over confident wrong answers.

The credibility of ${company} depends on your accuracy.
`

  // Build adaptive guidelines based on confidence
  let confidenceGuidelines = ''
  if (hasContext) {
    if (confidenceScore >= 0.7) {
      confidenceGuidelines = `
📊 CONFIDENCE LEVEL: HIGH (${(confidenceScore * 100).toFixed(0)}%)
The retrieved sources are highly relevant. You can answer with confidence.
Still, cite sources and don't add external knowledge.
`
    } else if (confidenceScore >= 0.5) {
      confidenceGuidelines = `
📊 CONFIDENCE LEVEL: MEDIUM (${(confidenceScore * 100).toFixed(0)}%)
The sources are moderately relevant. Be extra careful:
• Only answer what's explicitly clear in sources
• Acknowledge any limitations
• Offer escalation if needed
`
    } else {
      confidenceGuidelines = `
📊 CONFIDENCE LEVEL: LOW (${(confidenceScore * 100).toFixed(0)}%)
⚠️ The sources have low relevance. Be EXTREMELY cautious:
• Only answer if information is crystal clear
• Strongly consider saying "I don't have enough information"
• Prioritize accuracy over helpfulness
`
    }
  }

  // Combine everything
  return `${baseSystemPrompt}

${sourcesSection}

${reasoningFramework}

${outputConstraints}

${enforcementWarnings}

${confidenceGuidelines}

═══════════════════════════════════════════════════════════════════════════

NOW RESPOND TO THE USER'S QUESTION.

Remember: Accuracy > Helpfulness. Truth > Completeness. Honesty > Confidence.
`
}

/**
 * Build response verification prompt
 * This can be used in a two-step process to verify answers
 */
export function buildVerificationPrompt(
  originalQuestion: string,
  proposedAnswer: string,
  sources: Array<{ id: string; content: string }>
): string {
  return `You are a fact-checker. Your job is to verify if an answer is accurate.

ORIGINAL QUESTION:
${originalQuestion}

PROPOSED ANSWER:
${proposedAnswer}

AVAILABLE SOURCES:
${sources.map((s, i) => `[Source ${i + 1}]: ${s.content}`).join('\n\n')}

VERIFICATION TASK:
Check if EVERY factual claim in the proposed answer is:
1. Explicitly stated in the sources
2. Accurately represented (not distorted or misinterpreted)
3. Properly attributed to a source

Respond in this format:
{
  "isAccurate": true/false,
  "issues": ["list of any inaccuracies or unsupported claims"],
  "confidence": 0-1,
  "recommendation": "approve/revise/reject"
}
`
}

/**
 * Build chain-of-thought prompt for complex queries
 */
export function buildChainOfThoughtPrompt(
  basePrompt: string,
  sources: Array<{ id: string; content: string; relevance: number }>
): string {
  return `${basePrompt}

SOURCES:
${sources.map((s, i) => `[Source ${i + 1}]: ${s.content}`).join('\n\n---\n\n')}

───────────────────────────────────────────────────────────────────────────

🧠 CHAIN-OF-THOUGHT REASONING (required for complex queries):

Before answering, reason through the problem step by step:

1. UNDERSTAND: What exactly is the user asking?
2. SEARCH: Which sources contain relevant information?
3. EXTRACT: What specific facts do I need from each source?
4. CONNECT: How do these facts relate to answer the question?
5. VERIFY: Is my reasoning sound? Am I adding anything not in sources?
6. FORMULATE: Construct answer using ONLY extracted facts

Show your reasoning internally, then provide the final answer to the user.
`
}

/**
 * Extract and format sources for citation
 */
export function formatSourceCitations(
  sources: Array<{ id: string; content: string; relevance: number }>,
  maxSources: number = 3
): string {
  if (sources.length === 0) return ''

  const topSources = sources
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxSources)

  return `

───────────────────────────────────────────────────────────────────────────
📚 Sources used in this answer:

${topSources.map((s, i) => `  ${i + 1}. [Source ${i + 1}] (Relevance: ${(s.relevance * 100).toFixed(0)}%)`).join('\n')}

All information provided comes exclusively from these verified sources.
───────────────────────────────────────────────────────────────────────────
`
}
