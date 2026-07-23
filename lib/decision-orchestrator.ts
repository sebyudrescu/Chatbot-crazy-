/**
 * DECISION ORCHESTRATOR - Il "Cervello" del Sistema Cognitivo
 * 
 * Questo è il componente più critico della nuova architettura.
 * Orchestra TUTTE le decisioni su come gestire una query:
 * 
 * 1. COMPRENSIONE: Analizza query, intent, contesto, entità
 * 2. DECISIONE: Sceglie quale memoria usare (persistente, KB, contesto)
 * 3. RECUPERO: Esegue retrieval multi-dimensionale
 * 4. VALIDAZIONE: Verifica coerenza tra fonti
 * 5. GENERAZIONE: Prepara contesto per LLM
 * 6. APPRENDIMENTO: Estrae nuovi fatti da memorizzare
 * 
 * FLUSSO DECISIONALE:
 * Query → Classify Intent → Plan Retrieval → Execute Retrieval → 
 * Validate Coherence → Generate Response → Extract Facts
 * 
 * @module decision-orchestrator
 */

import 'server-only'
import OpenAI from 'openai'
import { classifyIntent, type IntentResult } from './intent-classifier'
import { classifyQuery, type QueryClassification } from './query-classifier'
import { buildMemoryContext, formatFactsForPrompt, type MemoryContext } from './structured-memory'
import { extractFactsIncremental, extractEntitiesQuick } from './fact-extractor'
import { 
  retrieveForQuery, 
  type RetrievalResult,
  type RetrievalContext
} from './multi-dimensional-retrieval'
import {
  validateCoherence,
  formatValidationForLog,
  type ValidationContext,
  type ValidationResult
} from './coherence-validator'
import { generateSystemPrompt } from './prompt-manager'
import { parseJSON } from './utils'
import { 
  queryGraph, 
  searchEntities, 
  getRelatedEntities,
  findEntity,
  type GraphEntity,
  type GraphRelation
} from './knowledge-graph'
import { extractEntityMentions } from './entity-extractor'
import { eventStore } from './event-store'
import { recordAIUsage } from './ai-usage'
import { DEFAULT_CHAT_MODEL, normalizeAIModel } from './ai-models'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// ============================================================================
// TYPES
// ============================================================================

export interface OrchestratorContext {
  // Identifiers
  botId: string
  conversationId: string
  
  // Current query
  query: string
  
  // Conversation state
  conversationHistory: Array<{ role: string; content: string }>
  conversationMetadata: {
    userIntent?: string
    sentiment?: string
    topics?: string[]
  }
  
  // Bot configuration
  botConfig: {
    companyName: string
    promptTemplateId?: string | null
    systemPrompt?: string | null
    promptVariables?: Record<string, string> | null
    role?: string
    objective?: string
    personality?: string
    rules?: string[]
    forbiddenTopics?: string[]
    forbiddenResponses?: string[]
    handoffTriggers?: string[]
    leadCollectionFields?: string[]
    language?: string
    tone?: string
    responseLength?: 'short' | 'balanced' | 'detailed'
    fallbackMessage?: string
    handoffMessage?: string
    aiModel?: string
    temperature?: number
    maxTokens?: number
  }
}

function getPromptConfig(context: OrchestratorContext) {
  return { ...context.botConfig, companyName: context.botConfig.companyName }
}

function getModel(context: OrchestratorContext, fallback = DEFAULT_CHAT_MODEL) {
  return normalizeAIModel(context.botConfig.aiModel || fallback)
}

function getTemperature(context: OrchestratorContext, fallback: number) {
  return context.botConfig.temperature ?? fallback
}

function getMaxTokens(context: OrchestratorContext, fallback: number) {
  return context.botConfig.maxTokens ?? fallback
}

export interface OrchestratorDecision {
  // Classification
  intent: IntentResult
  queryClassification: QueryClassification
  
  // Retrieval strategy
  retrievalPlan: {
    sources: ('persistent' | 'knowledge_base' | 'context' | 'knowledge_graph')[]
    reasoning: string
  }
  
  // Extracted entities
  entities: string[]
  topics: string[]
  graphEntities: GraphEntity[]  // NEW: Entities from knowledge graph
  
  // Decision metadata
  shouldUseRAG: boolean
  shouldUseGraph: boolean  // NEW: Whether to use knowledge graph
  responseStrategy: 'conversational' | 'rag_enhanced' | 'memory_personalized' | 'hybrid' | 'graph_reasoning' | 'identity_authoritative'
  confidenceThreshold: number
}

export interface OrchestratorResult {
  // Decision made
  decision: OrchestratorDecision
  
  // Retrieved data
  retrievalResult?: RetrievalResult
  graphResult?: {
    entities: GraphEntity[]
    relations: GraphRelation[]
    reasoning: string
  }
  validationResult?: ValidationResult
  
  // Generated response
  response: string
  quickReplies?: any[]  // NEW: Dynamic quick replies for UX
  
  // Metadata
  sourcesUsed: any[]
  metadata: {
    responseType: string
    confidence: number
    processingTimeMs: number
  }
  
  // Learning
  extractedFacts: any[]
}

// ============================================================================
// MAIN ORCHESTRATION FUNCTION
// ============================================================================

/**
 * Orchestrate complete decision-making and response generation
 */
export async function orchestrateResponse(context: OrchestratorContext): Promise<OrchestratorResult> {
  const startTime = Date.now()
  
  console.log(`\n🧠 [Orchestrator] ========== NEW REQUEST ==========`)
  console.log(`[Orchestrator] Query: "${context.query}"`)
  console.log(`[Orchestrator] Bot: ${context.botConfig.companyName}`)
  
  // Log request started
  await eventStore.logRequestStarted(context.botId, context.conversationId, {
    query: context.query,
    userId: context.conversationHistory[0]?.role === 'user' ? context.conversationId : undefined,
  })
  
  // ========================================================================
  // PHASE 1: UNDERSTANDING - Comprendi la query
  // ========================================================================
  
  console.log(`\n📊 [Orchestrator] PHASE 1: UNDERSTANDING`)
  
  // 1.1 Classify intent
  const intent = await classifyIntent(context.query, context.conversationHistory, { botId: context.botId, conversationId: context.conversationId })
  console.log(`   Intent: ${intent.intent} (confidence: ${(intent.confidence * 100).toFixed(0)}%)`)
  console.log(`   Reasoning: ${intent.reasoning}`)
  
  // 1.2 Classify query type
  const queryClassification = classifyQuery(context.query)
  console.log(`   Query Type: ${queryClassification.type} (complexity: ${queryClassification.complexity})`)
  
  // 1.3 Extract entities
  const entities = extractEntitiesQuick(context.query)
  const topics = context.conversationMetadata.topics || []
  console.log(`   Entities: ${entities.length > 0 ? entities.join(', ') : 'none'}`)
  console.log(`   Topics: ${topics.length > 0 ? topics.join(', ') : 'none'}`)
  
  // ========================================================================
  // PHASE 2: DECISION - Decidi la strategia di risposta
  // ========================================================================
  
  console.log(`\n🎯 [Orchestrator] PHASE 2: DECISION`)
  
  const decision = makeDecision({
    intent,
    queryClassification,
    entities,
    topics,
    conversationLength: context.conversationHistory.length
  })
  
  console.log(`   Strategy: ${decision.responseStrategy}`)
  console.log(`   Use RAG: ${decision.shouldUseRAG}`)
  console.log(`   Sources: ${decision.retrievalPlan.sources.join(', ')}`)
  console.log(`   Reasoning: ${decision.retrievalPlan.reasoning}`)
  
  // Log decision made
  await eventStore.logDecisionMade(context.botId, context.conversationId, {
    intent: intent.intent,
    strategy: decision.responseStrategy,
    sources: decision.retrievalPlan.sources,
    shouldUseRAG: decision.shouldUseRAG,
    shouldUseGraph: decision.shouldUseGraph,
    entities,
  })
  
  // ========================================================================
  // PHASE 3: RETRIEVAL - Recupera informazioni (se necessario)
  // ========================================================================
  
  let retrievalResult: RetrievalResult | undefined
  let validationResult: ValidationResult | undefined
  let graphResult: { entities: GraphEntity[]; relations: GraphRelation[]; reasoning: string } | undefined
  
  if (decision.shouldUseRAG) {
    console.log(`\n🔍 [Orchestrator] PHASE 3: RETRIEVAL`)
    
    // Execute multi-dimensional retrieval
    retrievalResult = await retrieveForQuery({
      botId: context.botId,
      conversationId: context.conversationId,
      query: context.query,
      intent: intent.intent,
      entities,
      topics,
      recentMessages: context.conversationHistory
    })
    
    console.log(`   Retrieved:`)
    console.log(`   - ${retrievalResult.persistentFacts.length} persistent facts`)
    console.log(`   - ${retrievalResult.knowledgeChunks.length} KB chunks`)
    console.log(`   - Sources used: ${retrievalResult.source.join(', ')}`)
    
    // Execute Knowledge Graph retrieval if needed
    if (decision.shouldUseGraph) {
      console.log(`\n🕸️ [Orchestrator] PHASE 3.5: KNOWLEDGE GRAPH RETRIEVAL`)
      
      try {
        graphResult = await queryGraph(context.botId, context.query)
        
        console.log(`   Graph Retrieved:`)
        console.log(`   - ${graphResult.entities.length} entities`)
        console.log(`   - ${graphResult.relations.length} relations`)
        console.log(`   - Reasoning: ${graphResult.reasoning}`)
        
        // Update decision with found entities
        decision.graphEntities = graphResult.entities
      } catch (error: any) {
        console.error(`[Orchestrator] Graph query error:`, error.message)
        // Continue without graph data
        graphResult = { entities: [], relations: [], reasoning: 'Graph query failed' }
      }
    }
    
    // ========================================================================
    // PHASE 4: VALIDATION - Valida coerenza
    // ========================================================================
    
    console.log(`\n✅ [Orchestrator] PHASE 4: VALIDATION`)
    
    const validationContext: ValidationContext = {
      currentQuery: context.query,
      currentTopic: topics[topics.length - 1],
      mentionedEntities: entities,
      conversationIntent: intent.intent,
      persistentFacts: retrievalResult.persistentFacts,
      knowledgeChunks: retrievalResult.knowledgeChunks,
      recentMessages: context.conversationHistory
    }
    
    validationResult = await validateCoherence(validationContext)
    
    console.log(formatValidationForLog(validationResult))
    
    // Update retrieval result with validated data
    retrievalResult.persistentFacts = validationResult.validatedFacts
    retrievalResult.knowledgeChunks = validationResult.validatedChunks
    
    // If coherence is too low and we have conflicts, add warning to context
    if (!validationResult.isCoherent && validationResult.conflicts.length > 0) {
      console.log(`⚠️ [Orchestrator] Low coherence detected, will inform user`)
    }
  }
  
  // ========================================================================
  // PHASE 5: GENERATION - Genera risposta
  // ========================================================================
  
  console.log(`\n💬 [Orchestrator] PHASE 5: GENERATION`)
  
  const generationResult = process.env.CI_MOCK_AI === 'true'
    ? {
        response: retrievalResult?.knowledgeChunks[0]?.text
          ? `Risposta verificata dalla knowledge base: ${retrievalResult.knowledgeChunks[0].text.slice(0, 500)}`
          : `Risposta di test verificata per ${context.botConfig.companyName}.`,
        sourcesUsed: (retrievalResult?.knowledgeChunks || []).map((chunk) => ({
          sourceId: chunk.metadata?.sourceId,
          sourceType: chunk.metadata?.sourceType || 'manual',
          score: chunk.score,
        })).filter((source) => source.sourceId),
        confidence: retrievalResult?.knowledgeChunks.length ? 0.9 : 0.7,
        quickReplies: [],
      }
    : await generateResponse({
        context,
        decision,
        intent,
        retrievalResult,
        graphResult,
        validationResult
      })
  
  console.log(`   Response generated (${generationResult.response.length} chars)`)
  console.log(`   Sources used: ${generationResult.sourcesUsed.length}`)
  
  // ========================================================================
  // PHASE 6: LEARNING - Estrai nuovi fatti
  // ========================================================================
  
  console.log(`\n🧠 [Orchestrator] PHASE 6: LEARNING`)
  
  let extractedFacts: any[] = []
  
  // Extract facts only if this was a meaningful exchange
  if (process.env.CI_MOCK_AI === 'true') {
    console.log(`   Skipped fact extraction (CI mock)`)
  } else if (decision.shouldUseRAG || intent.intent === 'question') {
    try {
      extractedFacts = await extractFactsIncremental({
        conversationId: context.conversationId,
        botId: context.botId,
        userMessage: context.query,
        assistantMessage: generationResult.response,
        conversationContext: context.conversationHistory,
        currentIntent: intent.intent
      })
      
      console.log(`   Extracted ${extractedFacts.length} new facts`)
    } catch (error) {
      console.error(`[Orchestrator] Error extracting facts:`, error)
    }
  } else {
    console.log(`   Skipped fact extraction (conversational intent)`)
  }
  
  // ========================================================================
  // FINALIZE
  // ========================================================================
  
  const processingTimeMs = Date.now() - startTime
  
  console.log(`\n✅ [Orchestrator] ========== COMPLETED ==========`)
  console.log(`[Orchestrator] Processing time: ${processingTimeMs}ms`)
  console.log(`[Orchestrator] Strategy: ${decision.responseStrategy}`)
  console.log(`[Orchestrator] Facts learned: ${extractedFacts.length}`)
  
  // Log request completed
  await eventStore.logRequestCompleted(context.botId, context.conversationId, processingTimeMs, {
    strategy: decision.responseStrategy,
    factsLearned: extractedFacts.length,
    confidence: generationResult.confidence,
  })
  
  return {
    decision,
    retrievalResult,
    graphResult,
    validationResult,
    response: generationResult.response,
    sourcesUsed: generationResult.sourcesUsed,
    quickReplies: generationResult.quickReplies,  // NEW: Pass through quick replies
    metadata: {
      responseType: decision.responseStrategy,
      confidence: generationResult.confidence,
      processingTimeMs
    },
    extractedFacts
  }
}

// ============================================================================
// DECISION MAKING
// ============================================================================

/**
 * Make strategic decision on how to handle the query
 */
function makeDecision(params: {
  intent: IntentResult
  queryClassification: QueryClassification
  entities: string[]
  topics: string[]
  conversationLength: number
}): OrchestratorDecision {
  const { intent, queryClassification, entities, topics, conversationLength } = params
  
  // Base decision on intent
  let shouldUseRAG = intent.shouldUseRAG
  let shouldUseGraph = false
  let responseStrategy: OrchestratorDecision['responseStrategy'] = 'conversational'
  let sources: ('persistent' | 'knowledge_base' | 'context' | 'knowledge_graph')[] = ['context']
  let reasoning = ''
  
  // Detect relational queries (queries that ask about connections)
  const isRelationalQuery = detectRelationalQuery(params.queryClassification, entities)
  
  // === IDENTITY QUESTIONS (HIGHEST PRIORITY - Always use KB + Graph) ===
  if (intent.intent === 'identity_question') {
    shouldUseRAG = true  // FORCE retrieval
    shouldUseGraph = true  // Use graph for company entity
    responseStrategy = 'identity_authoritative'
    sources = ['knowledge_base', 'knowledge_graph']
    reasoning = 'DOMANDA DI IDENTITÀ AZIENDALE - Usa SEMPRE KB + grafo per rispondere come azienda'
  }
  // === CONVERSATIONAL INTENTS (no RAG) ===
  else if (!shouldUseRAG) {
    responseStrategy = 'conversational'
    sources = ['context']
    reasoning = 'Intent conversazionale - risposta diretta senza recupero informazioni'
  }
  // === RELATIONAL QUESTIONS (Use Knowledge Graph) ===
  else if (isRelationalQuery && entities.length > 0) {
    responseStrategy = 'graph_reasoning'
    sources = ['knowledge_graph', 'knowledge_base']
    shouldUseGraph = true
    reasoning = 'Domanda relazionale con entità - usa knowledge graph per reasoning su connessioni'
  }
  // === QUESTIONS WITH ENTITIES (Hybrid: Memory + KB + Graph) ===
  else if (intent.intent === 'question' && entities.length > 0) {
    responseStrategy = 'hybrid'
    sources = ['persistent', 'knowledge_base', 'knowledge_graph']
    shouldUseGraph = true
    reasoning = 'Domanda con entità specifiche - combina memoria utente + knowledge base + graph'
  }
  // === FOLLOW-UP OR USER-SPECIFIC (Memory personalized) ===
  else if (conversationLength > 2 && queryClassification.complexity === 'simple') {
    responseStrategy = 'memory_personalized'
    sources = ['persistent', 'context']
    reasoning = 'Domanda semplice in conversazione attiva - usa memoria personalizzata'
  }
  // === FACTUAL QUESTIONS (RAG enhanced) ===
  else if (intent.intent === 'question') {
    responseStrategy = 'rag_enhanced'
    sources = ['knowledge_base']
    reasoning = 'Domanda fattuale - usa knowledge base aziendale'
  }
  // === DEFAULT ===
  else {
    responseStrategy = 'rag_enhanced'
    sources = ['knowledge_base']
    reasoning = 'Default - recupera da knowledge base'
  }
  
  // Set confidence threshold based on strategy
  let confidenceThreshold = 0.65
  if (responseStrategy === 'identity_authoritative') {
    confidenceThreshold = 0.8 // Highest for identity - must be accurate
  } else if (responseStrategy === 'memory_personalized') {
    confidenceThreshold = 0.5 // More lenient for memory
  } else if (responseStrategy === 'rag_enhanced') {
    confidenceThreshold = 0.7 // Stricter for KB
  } else if (responseStrategy === 'graph_reasoning') {
    confidenceThreshold = 0.6 // Medium for graph
  }
  
  return {
    intent,
    queryClassification,
    retrievalPlan: {
      sources,
      reasoning
    },
    entities,
    topics,
    graphEntities: [], // Will be populated during retrieval
    shouldUseRAG,
    shouldUseGraph,
    responseStrategy,
    confidenceThreshold
  }
}

/**
 * Detect if query is asking about relationships/connections
 */
function detectRelationalQuery(
  classification: QueryClassification,
  entities: string[]
): boolean {
  // Relational keywords
  const relationalKeywords = [
    'quali', 'cosa', 'come', 'differenza', 'confronto', 'confronta',
    'ha', 'hanno', 'include', 'contiene', 'compatibile', 'funziona con',
    'caratteristiche', 'feature', 'proprietà', 'specifiche',
    'relazione', 'collegato', 'connesso', 'parte di',
    'prezzo', 'costo', 'costa', 'quanto',
    'sostituisce', 'aggiorna', 'migliore', 'peggiore'
  ]
  
  // Must have entities to be relational
  if (entities.length === 0) return false
  
  // Check for relational patterns in query
  const hasRelationalKeyword = relationalKeywords.some(keyword =>
    classification.type === 'factual' || classification.type === 'complex'
  )
  
  return hasRelationalKeyword && classification.type !== 'conversational'
}

// ============================================================================
// RESPONSE GENERATION
// ============================================================================

/**
 * Generate response using appropriate strategy
 */
async function generateResponse(params: {
  context: OrchestratorContext
  decision: OrchestratorDecision
  intent: IntentResult
  retrievalResult?: RetrievalResult
  graphResult?: { entities: GraphEntity[]; relations: GraphRelation[]; reasoning: string }
  validationResult?: ValidationResult
}): Promise<{
  response: string
  sourcesUsed: any[]
  confidence: number
  quickReplies?: any[]
}> {
  const { context, decision, intent, retrievalResult, graphResult, validationResult } = params
  
  // Build conversation messages
  const conversationMessages = context.conversationHistory.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }))
  
  conversationMessages.push({
    role: 'user',
    content: context.query
  })
  
  // === STRATEGY 0: IDENTITY AUTHORITATIVE (special handling) ===
  if (decision.responseStrategy === 'identity_authoritative') {
    return await generateIdentityResponse({
      context,
      decision,
      retrievalResult,
      graphResult,
      validationResult,
      conversationMessages
    })
  }
  
  // === STRATEGY 1: CONVERSATIONAL (no retrieval) ===
  if (decision.responseStrategy === 'conversational') {
    const systemPrompt = generateSystemPrompt(getPromptConfig(context))
    const model = getModel(context)
    const aiStartedAt = Date.now()
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationMessages
      ],
      temperature: getTemperature(context, 0.7),
      max_tokens: getMaxTokens(context, 300)
    })
    await recordAIUsage({ botId: context.botId, conversationId: context.conversationId, feature: 'chat_response', model, usage: completion.usage, durationMs: Date.now() - aiStartedAt })
    
    return {
      response: completion.choices[0]?.message?.content || 'Mi dispiace, non riesco a rispondere.',
      sourcesUsed: [],
      confidence: intent.confidence
    }
  }
  
  // === STRATEGY 2-4: With retrieval ===
  if (!retrievalResult) {
    throw new Error('Retrieval result required for this strategy')
  }
  
  // Build enhanced system prompt with retrieved context
  let baseSystemPrompt = generateSystemPrompt(getPromptConfig(context))
  
  // Add business context
  const { getCachedBusinessContext, formatBusinessContextForPrompt } = await import('./business-context')
  const businessContext = await getCachedBusinessContext(context.botId)
  baseSystemPrompt += formatBusinessContextForPrompt(businessContext)
  
  // Add retrieved context
  baseSystemPrompt += '\n\n---\n\n'
  baseSystemPrompt += retrievalResult.combinedContext
  
  // Add Knowledge Graph context if available
  if (graphResult && graphResult.entities.length > 0) {
    baseSystemPrompt += '\n\n## KNOWLEDGE GRAPH - Entità e Relazioni\n\n'
    baseSystemPrompt += formatGraphForPrompt(graphResult)
  }
  
  // Add coherence warnings if needed
  if (validationResult && !validationResult.isCoherent) {
    baseSystemPrompt += '\n\n**⚠️ ATTENZIONE**: Alcuni conflitti rilevati nelle informazioni. Menziona eventuali incertezze nella risposta.\n'
  }
  
  // Adaptive parameters based on confidence
  const hasHighQualityData = (retrievalResult.persistentFacts.length > 0 || 
                               retrievalResult.knowledgeChunks.length >= 2)
  
  const temperature = getTemperature(context, hasHighQualityData ? 0.3 : 0.2)
  const maxTokens = getMaxTokens(context, hasHighQualityData ? 500 : 350)
  
  console.log(`   Using temperature: ${temperature}, max_tokens: ${maxTokens}`)
  
  const model = getModel(context)
  const aiStartedAt = Date.now()
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: baseSystemPrompt },
      ...conversationMessages
    ],
    temperature,
    max_tokens: maxTokens,
    top_p: 0.9
  })
  await recordAIUsage({ botId: context.botId, conversationId: context.conversationId, feature: 'chat_response_rag', model, usage: completion.usage, durationMs: Date.now() - aiStartedAt })
  
  const response = completion.choices[0]?.message?.content || 'Mi dispiace, non riesco a rispondere.'
  
  // Extract sources
  const sourcesUsed: any[] = []
  
  // Add KB sources
  for (const chunk of retrievalResult.knowledgeChunks) {
    if (!sourcesUsed.find(s => s.sourceId === chunk.metadata.sourceId)) {
      sourcesUsed.push({
        sourceId: chunk.metadata.sourceId,
        sourceType: chunk.metadata.sourceType,
        score: chunk.score
      })
    }
  }
  
  // Calculate confidence
  const confidence = calculateResponseConfidence({
    retrievalResult,
    validationResult,
    decision
  })
  
  return {
    response,
    sourcesUsed,
    confidence
  }
}

/**
 * Calculate response confidence
 */
function calculateResponseConfidence(params: {
  retrievalResult: RetrievalResult
  validationResult?: ValidationResult
  decision: OrchestratorDecision
}): number {
  const { retrievalResult, validationResult, decision } = params
  
  let confidence = 0.5
  
  // Boost for having data
  if (retrievalResult.persistentFacts.length > 0) {
    confidence += 0.2
  }
  
  if (retrievalResult.knowledgeChunks.length > 0) {
    const avgKBScore = retrievalResult.knowledgeChunks.reduce((sum, c) => sum + c.score, 0) / 
                       retrievalResult.knowledgeChunks.length
    confidence += avgKBScore * 0.3
  }
  
  // Adjust for coherence
  if (validationResult) {
    confidence *= validationResult.coherenceScore
  }
  
  // Cap at 1.0
  return Math.min(1.0, confidence)
}

/**
 * Generate response for identity questions with MANDATORY template+KB fusion
 * This ensures the bot always speaks as the company, never as a generic assistant
 */
async function generateIdentityResponse(params: {
  context: OrchestratorContext
  decision: OrchestratorDecision
  retrievalResult?: RetrievalResult
  graphResult?: { entities: GraphEntity[]; relations: GraphRelation[]; reasoning: string }
  validationResult?: ValidationResult
  conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<{
  response: string
  sourcesUsed: any[]
  confidence: number
  quickReplies?: any[]
}> {
  const { context, retrievalResult, graphResult, validationResult, conversationMessages } = params
  
  console.log(`   [Identity Response] Building unified company identity prompt...`)
  
  // 1. Get base template (defines HOW to speak, not WHAT to say)
  let baseTemplate = generateSystemPrompt(getPromptConfig(context))
  
  // 2. Build identity fusion prompt
  let identityPrompt = `${baseTemplate}

## ═══════════════════════════════════════════════════════════════
## IDENTITÀ AZIENDALE - FONTE DI VERITÀ ASSOLUTA
## ═══════════════════════════════════════════════════════════════

Tu NON sei un assistente virtuale generico.
Tu NON sei un chatbot.
Tu NON sei un AI.

Tu SEI la voce ufficiale di ${context.botConfig.companyName}.
Quando rispondi, parli COME L'AZIENDA STESSA.

`
  
  // 3. Add business context (always required for identity)
  const { getCachedBusinessContext, formatBusinessContextForPrompt } = await import('./business-context')
  const businessContext = await getCachedBusinessContext(context.botId)
  
  if (businessContext.aboutUs || (businessContext.mainServices && businessContext.mainServices.length > 0)) {
    identityPrompt += `### CHI SIAMO - INFORMAZIONI AZIENDALI\n\n`
    identityPrompt += formatBusinessContextForPrompt(businessContext)
  }
  
  // 4. Add Knowledge Base chunks (specific docs about company)
  if (retrievalResult && retrievalResult.knowledgeChunks.length > 0) {
    identityPrompt += `\n### DOCUMENTAZIONE AZIENDALE\n\n`
    identityPrompt += retrievalResult.combinedContext
  }
  
  // 5. Add Knowledge Graph entities (company structure, services, products)
  if (graphResult && graphResult.entities.length > 0) {
    identityPrompt += `\n### STRUTTURA AZIENDALE (Knowledge Graph)\n\n`
    identityPrompt += formatGraphForPrompt(graphResult)
  }
  
  // 6. MANDATORY INSTRUCTIONS - Forces unified identity
  identityPrompt += `

## ═══════════════════════════════════════════════════════════════
## ISTRUZIONI CRITICHE - IDENTITÀ UNIFICATA
## ═══════════════════════════════════════════════════════════════

**REGOLE OBBLIGATORIE:**

1. ✅ PARLA IN PRIMA PERSONA PLURALE come rappresentante dell'azienda
   - Esempio corretto: "Siamo ${context.botConfig.companyName}. Offriamo servizi di..."
   - Esempio corretto: "La nostra missione è..."
   - Esempio corretto: "Ci occupiamo di..."

2. ❌ NON dire MAI:
   - "Sono un assistente virtuale"
   - "Sono un chatbot/bot/AI"
   - "Sono qui per aiutarti con ${context.botConfig.companyName}"
   - "Posso fornirti informazioni su ${context.botConfig.companyName}"

3. ✅ USA SOLO le informazioni sopra riportate per descrivere l'azienda
   - Se un dettaglio specifico non è presente, dì: "Al momento non abbiamo informazioni dettagliate su questo aspetto" (sempre in prima persona plurale)

4. ✅ MANTIENI il tono e lo stile definiti nel template, MA il contenuto DEVE derivare dalle informazioni aziendali sopra

5. ✅ Se non ci sono informazioni nella knowledge base, rispondi comunque come azienda:
   - Esempio: "Siamo ${context.botConfig.companyName}. Per maggiori dettagli su questo aspetto specifico, ti invito a contattarci direttamente."

**VERIFICA PRIMA DI RISPONDERE:**
- [ ] Sto parlando come l'azienda? (prima persona plurale: "siamo", "offriamo", "ci occupiamo")
- [ ] Ho evitato di presentarmi come assistente/chatbot/AI?
- [ ] Ho usato le informazioni dalla knowledge base?

Ora rispondi alla domanda dell'utente mantenendo questa identità unificata.
`

  console.log(`   [Identity Response] Prompt length: ${identityPrompt.length} chars`)
  console.log(`   [Identity Response] KB chunks: ${retrievalResult?.knowledgeChunks.length || 0}`)
  console.log(`   [Identity Response] Graph entities: ${graphResult?.entities.length || 0}`)
  
  // 7. Generate response with LOW temperature (precision is critical for identity)
  // FORCE SHORT RESPONSES by limiting tokens drastically
  const isFirstMessage = conversationMessages.length <= 2
  const maxTokens = getMaxTokens(context, isFirstMessage ? 100 : 150)
  
  console.log(`   [Identity Response] Using max_tokens: ${maxTokens} (first message: ${isFirstMessage})`)
  
  const model = getModel(context, 'gpt-4o')
  const aiStartedAt = Date.now()
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: identityPrompt },
      ...conversationMessages
    ],
    temperature: getTemperature(context, 0.2),
    max_tokens: maxTokens,  // REDUCED from 600
    top_p: 0.95
  })
  await recordAIUsage({ botId: context.botId, conversationId: context.conversationId, feature: 'chat_identity', model, usage: completion.usage, durationMs: Date.now() - aiStartedAt })
  
  let response = completion.choices[0]?.message?.content || 'Mi dispiace, non riesco a rispondere.'
  
  // 7.5. Response Length Control (NEW!)
  const { adjustResponseLength } = await import('./response-length-controller')
  
  const lengthControlResult = await adjustResponseLength(response, {
    messageCount: conversationMessages.length / 2,  // Divide by 2 since it includes both user and assistant
    intentType: 'identity_question',
    isFirstMessage: conversationMessages.length <= 2
  })
  
  console.log(`   [Identity Response] Length adjustment: ${lengthControlResult.strategy}`)
  console.log(`   [Identity Response] ${lengthControlResult.originalLength} → ${lengthControlResult.adjustedLength} chars`)
  
  response = lengthControlResult.adjustedResponse
  
  // 7.6. Generate Contextual Follow-up Question (NEW!)
  const { generateFollowUpQuestion, shouldAddFollowUp } = await import('./contextual-followup')
  
  let followUpQuestion: string | undefined
  
  if (shouldAddFollowUp('identity_question', conversationMessages.length / 2)) {
    const followUpResult = await generateFollowUpQuestion({
      intentType: 'identity_question',
      responseContent: response,
      botId: context.botId,
      conversationId: context.conversationId,
      businessContext,
      conversationStage: conversationMessages.length / 2,
      extractedEntities: params.decision.graphEntities.map(e => ({ 
        type: e.entityType, 
        name: e.entityName,
        id: e.id 
      }))
    })
    
    console.log(`   [Identity Response] Follow-up: "${followUpResult.question}"`)
    console.log(`   [Identity Response] Suggested action: ${followUpResult.suggestedAction}`)
    
    followUpQuestion = followUpResult.question
    
    // Append follow-up to response
    response = `${response}\n\n${followUpQuestion}`
  }
  
  // 7.7. Generate Dynamic Quick Replies (NEW!)
  const { generateQuickReplies, shouldShowQuickReplies } = await import('./dynamic-quick-replies')
  
  let quickReplies: any[] = []
  
  if (shouldShowQuickReplies('identity_question', conversationMessages.length / 2)) {
    const quickReplyResult = generateQuickReplies({
      intentType: 'identity_question',
      responseContent: response,
      conversationStage: conversationMessages.length / 2,
      businessContext,
      extractedEntities: params.decision.graphEntities.map(e => ({ 
        type: e.entityType, 
        name: e.entityName,
        id: e.id 
      })),
      userGoalDetected: 'explore'  // First contact is usually exploration
    })
    
    quickReplies = quickReplyResult.replies
    
    console.log(`   [Identity Response] Quick replies: ${quickReplies.length} options`)
    quickReplies.forEach(qr => console.log(`      - ${qr.icon} ${qr.text} (${qr.action})`))
  }
  
  // 8. Post-generation validation
  const isValid = validateIdentityResponse(response, context.botConfig.companyName)
  
  if (!isValid.valid) {
    console.warn(`   [Identity Response] ⚠️  Response validation FAILED: ${isValid.reason}`)
    console.warn(`   [Identity Response] Attempting retry with stricter instructions...`)
    
    // Retry with even more explicit instructions
    const retryPrompt = identityPrompt + `\n\n⚠️ ATTENZIONE: La tua precedente risposta non rispettava le regole di identità. Riprova assicurandoti di parlare SOLO come ${context.botConfig.companyName}, NON come assistente.`
    
    const retryModel = getModel(context, 'gpt-4o')
    const retryStartedAt = Date.now()
    const retryCompletion = await openai.chat.completions.create({
      model: retryModel,
      messages: [
        { role: 'system', content: retryPrompt },
        ...conversationMessages
      ],
      temperature: getTemperature(context, 0.1),
      max_tokens: getMaxTokens(context, 600)
    })
    await recordAIUsage({ botId: context.botId, conversationId: context.conversationId, feature: 'chat_identity_retry', model: retryModel, usage: retryCompletion.usage, durationMs: Date.now() - retryStartedAt })
    
    response = retryCompletion.choices[0]?.message?.content || response
  }
  
  // 9. Extract sources
  const sourcesUsed: any[] = []
  
  if (retrievalResult) {
    for (const chunk of retrievalResult.knowledgeChunks) {
      if (!sourcesUsed.find(s => s.sourceId === chunk.metadata.sourceId)) {
        sourcesUsed.push({
          sourceId: chunk.metadata.sourceId,
          sourceType: chunk.metadata.sourceType,
          score: chunk.score
        })
      }
    }
  }
  
  // 10. Calculate confidence
  const hasKBData = (retrievalResult?.knowledgeChunks.length || 0) > 0
  const hasGraphData = (graphResult?.entities.length || 0) > 0
  const hasBusinessContext = businessContext.aboutUs || (businessContext.mainServices && businessContext.mainServices.length > 0)
  
  let confidence = 0.6  // Base confidence for identity
  
  if (hasKBData) confidence += 0.2
  if (hasGraphData) confidence += 0.1
  if (hasBusinessContext) confidence += 0.1
  
  console.log(`   [Identity Response] Final confidence: ${confidence.toFixed(2)}`)
  
  return {
    response,
    sourcesUsed,
    confidence: Math.min(1.0, confidence),
    quickReplies  // NEW: Return quick replies to frontend
  }
}

/**
 * Validate that identity response doesn't use forbidden generic phrases
 */
function validateIdentityResponse(response: string, companyName: string): { valid: boolean; reason?: string } {
  const lowerResponse = response.toLowerCase()
  
  // Forbidden phrases that indicate generic assistant identity
  const forbiddenPhrases = [
    'sono un assistente',
    'sono un chatbot',
    'sono un bot',
    'sono un ai',
    'sono un\'intelligenza artificiale',
    'come assistente virtuale',
    'in qualità di assistente',
    'sono qui per aiutarti con',
    'posso fornirti informazioni su',
    'posso aiutarti a conoscere'
  ]
  
  for (const phrase of forbiddenPhrases) {
    if (lowerResponse.includes(phrase)) {
      return {
        valid: false,
        reason: `Contains forbidden phrase: "${phrase}"`
      }
    }
  }
  
  // Check if response mentions company name appropriately
  // (Should speak AS the company, not ABOUT the company from outside)
  const aboutCompanyPhrases = [
    `informazioni su ${companyName.toLowerCase()}`,
    `aiutarti con ${companyName.toLowerCase()}`,
    `parlare di ${companyName.toLowerCase()}`
  ]
  
  for (const phrase of aboutCompanyPhrases) {
    if (lowerResponse.includes(phrase)) {
      return {
        valid: false,
        reason: `Speaks ABOUT company instead of AS company: "${phrase}"`
      }
    }
  }
  
  return { valid: true }
}

/**
 * Format Knowledge Graph data for LLM prompt
 */
function formatGraphForPrompt(graphResult: {
  entities: GraphEntity[]
  relations: GraphRelation[]
  reasoning: string
}): string {
  let formatted = `Queste entità e relazioni sono state trovate nel knowledge graph basandosi sulla tua query:\n\n`
  
  // Format entities
  if (graphResult.entities.length > 0) {
    formatted += `### Entità Rilevanti:\n\n`
    
    for (const entity of graphResult.entities.slice(0, 5)) {
      formatted += `**${entity.displayName || entity.entityName}** (${entity.entityType})\n`
      
      if (entity.description) {
        formatted += `- Descrizione: ${entity.description}\n`
      }
      
      if (Object.keys(entity.attributes).length > 0) {
        formatted += `- Attributi: ${JSON.stringify(entity.attributes)}\n`
      }
      
      formatted += `\n`
    }
  }
  
  // Format relations
  if (graphResult.relations.length > 0) {
    formatted += `### Relazioni:\n\n`
    
    // Group by relation type
    const relationsByType = new Map<string, GraphRelation[]>()
    for (const relation of graphResult.relations) {
      const existing = relationsByType.get(relation.relationType) || []
      existing.push(relation)
      relationsByType.set(relation.relationType, existing)
    }
    
    // Find entity names for relations
    const entityMap = new Map<string, string>()
    for (const entity of graphResult.entities) {
      entityMap.set(entity.id, entity.displayName || entity.entityName)
    }
    
    for (const [relationType, relations] of relationsByType.entries()) {
      formatted += `**${relationType.replace(/_/g, ' ')}**:\n`
      
      for (const relation of relations.slice(0, 3)) {
        const sourceName = entityMap.get(relation.sourceEntityId) || 'Unknown'
        const targetName = entityMap.get(relation.targetEntityId) || 'Unknown'
        
        formatted += `- ${sourceName} → ${targetName}`
        
        if (Object.keys(relation.attributes).length > 0) {
          formatted += ` (${JSON.stringify(relation.attributes)})`
        }
        
        formatted += `\n`
      }
      
      formatted += `\n`
    }
  }
  
  formatted += `\n**Usa queste informazioni strutturate per rispondere in modo preciso alle domande su relazioni, caratteristiche e connessioni tra entità.**\n`
  
  return formatted
}
