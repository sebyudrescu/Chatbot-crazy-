/**
 * NEW COGNITIVE CHAT API - Powered by Decision Orchestrator
 * 
 * Questa è la nuova versione che usa l'architettura cognitiva completa.
 * Il vecchio file route.ts rimane come backup durante la transizione.
 * 
 * DIFFERENZE CHIAVE:
 * - Usa decision-orchestrator.ts come "cervello" centrale
 * - Memoria strutturata multi-livello (persistent facts)
 * - Validazione coerenza tra fonti
 * - Decisioni consapevoli su quale memoria usare
 * - Estrazione fatti incrementale e strutturata
 * 
 * @module chat-api-v2
 */

import { after, NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MessageRole, type ChatbotSettings } from '@/lib/types'
import { stringifyJSON, parseJSON } from '@/lib/utils'
import { 
  orchestrateResponse, 
  type OrchestratorContext 
} from '@/lib/decision-orchestrator'
import { getOptimizedContext } from '@/lib/conversation-memory'
import { formatTokenUsage } from '@/lib/token-counter'
import { configuredCtasOnly } from '@/lib/cta-policy'
import { isAllowedWidgetOrigin } from '@/lib/widget-origin'
import { z } from 'zod'
import { checkRateLimit, requestClientIp } from '@/lib/rate-limit'
import { enforceOutgoingPolicy, evaluateIncomingPolicy, policyResponse } from '@/lib/agent-policy'
import { readWidgetSession, widgetSessionToken } from '@/lib/widget-session'
import { detectSentiment } from '@/lib/sentiment'
import { verifyOwnerSessionToken } from '@/lib/auth-token'
import { pageContextMatchesOrigin, pageContextSchema, type ProductCard } from '@/lib/commerce-types'
import { searchVerifiedProducts } from '@/lib/product-search'
import { hydrateProductCards } from '@/lib/commerce-catalog'
import { buildVerifiedProductResponse } from '@/lib/verified-product-response'
import { classifyCommerceIntent, parseCommerceQuery } from '@/lib/commerce-query'
import { tryVerifiedOrderLookup } from '@/lib/order-tracking'
import { emitIntegrationWebhook } from '@/lib/integration-webhooks'
import {
  buildContextualQuickReplies,
  catalogUnavailableResponse,
  detectBusinessMode,
  isVerifiedCatalogIntent,
  styleAdviceClarification,
} from '@/lib/conversation-guidance'

const ChatRequestSchema = z.object({
  botId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().nullable().optional(),
  userSessionId: z.string().max(300).optional(),
  source: z.enum(['widget']).optional(),
  pageContext: pageContextSchema.optional(),
})

function latestActiveProductIds(messages: Array<{ role: string; sourcesUsed: string | null; productCards: string | null }>) {
  for (const message of [...messages].reverse()) {
    if (message.role !== MessageRole.ASSISTANT) continue
    const sourceMetadata = (parseJSON(message.sourcesUsed) as { metadata?: { activeProductIds?: unknown } } | null)?.metadata
    if (Array.isArray(sourceMetadata?.activeProductIds)) {
      const ids = sourceMetadata.activeProductIds.filter((id): id is string => typeof id === 'string')
      if (ids.length > 0) return ids.slice(0, 5)
    }
    const cards = parseJSON(message.productCards)
    if (Array.isArray(cards)) {
      const ids = cards.map((card) => card?.productId).filter((id): id is string => typeof id === 'string')
      if (ids.length > 0) return ids.slice(0, 5)
    }
  }
  return []
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

// POST /api/chat - Cognitive chat with structured memory
export async function POST(request: NextRequest) {
  const routeStartedAt = Date.now()
  const requestId = request.headers.get('x-vercel-id') || crypto.randomUUID()
  try {
    const parsed = ChatRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Richiesta chat non valida' }, { status: 400 })
    }
    const body = parsed.data
    const { conversationId, message, botId } = body
    const existingConversation = conversationId
      ? await prisma.conversation.findFirst({
          where: { id: conversationId, botId },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 20,
            },
            chatbot: true,
          },
        })
      : null
    if (conversationId && !existingConversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }
    if (!await isAllowedWidgetOrigin(botId, request.headers.get('origin'), request.nextUrl.origin)) {
      return NextResponse.json({ success: false, error: 'origin_not_allowed' }, { status: 403 })
    }
    const requestOrigin = request.headers.get('origin')
    if (!requestOrigin && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'origin_required' }, { status: 403 })
    }
    const pageContext = body.pageContext && pageContextMatchesOrigin(body.pageContext, requestOrigin)
      ? body.pageContext
      : undefined
    if (body.source === 'widget') {
      if (!body.userSessionId) {
        return NextResponse.json({ success: false, error: 'widget_session_required' }, { status: 401 })
      }
      try {
        readWidgetSession(widgetSessionToken(request), botId, body.userSessionId)
      } catch {
        return NextResponse.json({ success: false, error: 'widget_session_invalid' }, { status: 401 })
      }
      if (existingConversation && existingConversation.userSessionId !== body.userSessionId) {
        return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
      }
      const rate = await checkRateLimit(`widget-chat:${botId}:${requestClientIp(request.headers)}`, 30, 60 * 1000)
      if (!rate.allowed) {
        return NextResponse.json(
          { success: false, error: 'rate_limit_exceeded' },
          { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } }
        )
      }
      const publication = await prisma.chatbot.findUnique({ where: { id: botId }, select: { isActive: true } })
      if (!publication?.isActive) {
        return NextResponse.json({ success: false, error: 'agent_not_published' }, { status: 403 })
      }
    } else {
      const password = process.env.APP_ACCESS_PASSWORD
      const ownerAllowed = !password && process.env.NODE_ENV !== 'production'
        ? true
        : Boolean(password) && await verifyOwnerSessionToken(
          request.cookies.get('litx_owner')?.value,
          password!,
          process.env.APP_AUTH_SALT || 'litx-private-owner',
        )
      if (!ownerAllowed) {
        return NextResponse.json({ success: false, error: 'Accesso non autorizzato' }, { status: 401 })
      }
    }
    
    console.log(`\n🤖 [ChatAPI] New request for bot: ${botId}`)

    // ========================================================================
    // STEP 1: GET OR CREATE CONVERSATION
    // ========================================================================
    
    let conversation = existingConversation
    if (conversationId) {
      conversation = existingConversation
    } else {
      const userSessionId = body.userSessionId || `session_${Date.now()}`
      conversation = await prisma.conversation.create({
        data: {
          botId,
          userSessionId,
        },
        include: {
          messages: true,
          chatbot: true,
        },
      })
    }

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }

    const previousAssistantText = [...conversation.messages]
      .reverse()
      .find((item) => item.role === MessageRole.ASSISTANT)?.content || ''
    const orderLookup = await tryVerifiedOrderLookup({
      botId,
      text: message,
      previousAssistantText,
      rateLimitScope: `${conversation.id}:${requestClientIp(request.headers)}`,
    })
    if (orderLookup.handled && orderLookup.response) {
      const [userMessage, assistantMessage] = await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: MessageRole.USER,
            content: orderLookup.redactedUserText,
          },
        }),
        prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: MessageRole.ASSISTANT,
            content: orderLookup.persistedResponse || orderLookup.response,
            sourcesUsed: stringifyJSON({
              sources: [],
              metadata: { responseType: 'verified_order_lookup', verified: orderLookup.verified, provider: orderLookup.provider, capability: orderLookup.capability },
            }),
          },
        }),
        prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            userIntent: 'order_tracking',
            ...(orderLookup.handoff ? {
              needsHumanEscalation: true,
              escalatedAt: new Date(),
              escalationReason: 'Tracking ordine non disponibile sul canale automatico',
            } : {}),
          },
        }),
      ])
      if (orderLookup.handoff) after(() => emitIntegrationWebhook({
        botId,
        event: 'conversation.handoff_requested',
        idempotencyKey: `order-lookup-handoff:${userMessage.id}`,
        payload: { conversationId: conversation.id, messageId: userMessage.id, reason: 'Tracking ordine non disponibile sul canale automatico' },
      }))
      return NextResponse.json({
        success: true,
        data: {
          conversationId: conversation.id,
          userMessage: { id: userMessage.id, content: userMessage.content, createdAt: userMessage.createdAt },
          assistantMessage: { id: assistantMessage.id, content: orderLookup.response, createdAt: assistantMessage.createdAt },
          sources: [],
          intent: { type: 'order_tracking', confidence: 1, reasoning: `Flusso deterministico con verifica ${orderLookup.provider || 'commerce'}` },
          queryClassification: { type: 'transactional', complexity: 'simple' },
          decision: { strategy: 'verified_order_lookup', sources: orderLookup.provider ? [orderLookup.provider] : [], reasoning: 'Verifica diretta sul negozio collegato' },
          confidence: { score: orderLookup.verified ? 1 : 0.8, isCoherent: true },
          handoffRequested: Boolean(orderLookup.handoff),
          memory: { persistentFactsUsed: 0, knowledgeChunksUsed: 0, factsExtracted: 0 },
          responseType: 'verified_order_lookup',
          processingTimeMs: 0,
          workflow: { executed: [], failed: [], skipped: [], actions: [] },
          actions: { executed: [], failed: [], skipped: [], ctas: [], leadForms: [], channelMessages: [], handoffActivated: Boolean(orderLookup.handoff) },
          quickReplies: [],
          ctas: [],
          productCards: [],
          orderLookupForm: Boolean(orderLookup.orderLookupForm),
          orderStatusCard: orderLookup.orderStatusCard,
        },
      })
    }

    // Transactional tools remain available even while knowledge is being
    // indexed; ordinary RAG answers still require a ready knowledge base.
    const { isBotReady } = await import('@/lib/ingestion-queue')
    const kbStatus = await isBotReady(botId)
    if (!kbStatus.ready) {
      console.log(`⚠️ [ChatAPI] KB not ready: ${kbStatus.status}`)
      return NextResponse.json({
        success: false,
        error: 'knowledge_base_not_ready',
        kbStatus: kbStatus.status,
        message: kbStatus.message,
        suggestion: kbStatus.status === 'indexing'
          ? 'Attendere qualche momento mentre indicizziamo la knowledge base.'
          : kbStatus.status === 'empty'
          ? 'Aggiungere prima alcuni documenti alla knowledge base.'
          : 'Errore durante l\'indicizzazione. Ricaricare i documenti.'
      }, { status: 503 })
    }
    console.log(`✅ [ChatAPI] KB ready with ${kbStatus.totalChunks} chunks`)

    // ========================================================================
    // STEP 2: SAVE USER MESSAGE
    // ========================================================================
    
    const userMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: message,
      },
    })

    // ========================================================================
    // STEP 4: OPTIMIZE CONVERSATION CONTEXT
    // ========================================================================
    
    console.log(`🧠 [ChatAPI] Optimizing conversation context (${conversation.messages.length} messages)`)
    
    const allMessages = conversation.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))

    const { contextMessages, summary, wasSummarized, usedTokens } = await getOptimizedContext(
      allMessages,
      {
        maxMessages: 8,
        maxTokens: 3000,
        enableSummarization: true,
        summaryThreshold: 10,
        existingSummary: conversation.summary || undefined,
        enableTokenCounting: true,
      }
    )

    if (wasSummarized) {
      console.log(`📝 [ChatAPI] Conversation summarized (${allMessages.length} → ${contextMessages.length} messages)`)
      console.log(`📊 [ChatAPI] Token usage: ${formatTokenUsage(usedTokens || 0, 4096)}`)
      
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          summary: summary,
          lastSummaryAt: new Date(),
        },
      })
    } else if (usedTokens) {
      console.log(`📊 [ChatAPI] Token usage: ${formatTokenUsage(usedTokens, 4096)}`)
    }

    // ========================================================================
    // STEP 5: ORCHESTRATE RESPONSE (COGNITIVE ENGINE)
    // ========================================================================
    
    console.log(`🧠 [ChatAPI] Invoking Decision Orchestrator...`)
    
    const chatbotSettings = (parseJSON(conversation.chatbot.settings) || {}) as ChatbotSettings
    const businessMode = detectBusinessMode([
      conversation.chatbot.companyName,
      conversation.chatbot.systemPrompt,
      conversation.chatbot.promptTemplateId,
      chatbotSettings.role,
      chatbotSettings.objective,
    ].filter(Boolean).join(' '))
    const activeProductIds = latestActiveProductIds(conversation.messages)
    const parsedCommerceQuery = parseCommerceQuery(message, businessMode === 'commerce')
    const classifiedCommerceIntent = classifyCommerceIntent(message, businessMode === 'commerce')
    const commerceIntent = classifiedCommerceIntent !== 'none'
      ? classifiedCommerceIntent
      : activeProductIds.length > 0 && parsedCommerceQuery.wantsCards
        ? 'product_discovery'
        : 'none'
    const productSearch = await searchVerifiedProducts(botId, message, pageContext, {
      intent: commerceIntent,
      activeProductIds,
    })
    const currentSentiment = detectSentiment(message)
    const incomingPolicy = evaluateIncomingPolicy(message, chatbotSettings)

    const needsStyleClarification = commerceIntent === 'fit_advice'
      && !productSearch.query.category
      && productSearch.selections.length === 0
    const requiresCatalog = isVerifiedCatalogIntent(commerceIntent)
    if (incomingPolicy.action === 'allow' && (needsStyleClarification || (requiresCatalog && productSearch.selections.length === 0))) {
      const response = needsStyleClarification
        ? styleAdviceClarification()
        : catalogUnavailableResponse(productSearch.catalogSize)
      const quickReplies = buildContextualQuickReplies({
        mode: businessMode,
        userMessage: message,
        assistantMessage: response,
        productCount: 0,
        catalogBlocked: !needsStyleClarification,
        commerceIntent,
      })
      const responseType = needsStyleClarification
        ? 'style_advice_clarification'
        : productSearch.catalogSize === 0
          ? 'verified_catalog_unavailable'
          : 'verified_catalog_no_match'
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.ASSISTANT,
          content: response,
          sourcesUsed: stringifyJSON({ sources: [], metadata: { responseType, verified: true } }),
          quickReplies: stringifyJSON(quickReplies),
          ctaData: stringifyJSON([]),
          productCards: stringifyJSON([]),
        },
      })
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), userIntent: 'product_search', sentiment: currentSentiment },
      })
      return NextResponse.json({
        success: true,
        data: {
          conversationId: conversation.id,
          userMessage: { id: userMessage.id, content: userMessage.content, createdAt: userMessage.createdAt },
          assistantMessage: { id: assistantMessage.id, content: assistantMessage.content, createdAt: assistantMessage.createdAt },
          sources: [],
          intent: { type: needsStyleClarification ? 'fit_advice' : 'product_search', confidence: 1, reasoning: needsStyleClarification ? 'Consiglio outfit: richiesta di dettaglio prima di proporre prodotti' : 'Richiesta prodotto vincolata al catalogo verificato' },
          queryClassification: { type: 'transactional', complexity: 'simple' },
          decision: { strategy: 'verified_catalog_guard', sources: ['product_catalog'], reasoning: 'Nessun prodotto verificato corrispondente' },
          confidence: { score: 1, isCoherent: true },
          handoffRequested: false,
          memory: { persistentFactsUsed: 0, knowledgeChunksUsed: 0, factsExtracted: 0 },
          responseType,
          processingTimeMs: 0,
          workflow: { executed: [], failed: [], skipped: [], actions: [] },
          actions: { executed: [], failed: [], skipped: [], ctas: [], leadForms: [], channelMessages: [], handoffActivated: false },
          quickReplies,
          ctas: [],
          productCards: [],
        },
      })
    }
    const orchestratorContext: OrchestratorContext = {
      botId,
      conversationId: conversation.id,
      query: message,
      conversationHistory: contextMessages,
      conversationMetadata: {
        userIntent: conversation.userIntent || undefined,
        sentiment: conversation.sentiment || undefined,
        topics: conversation.topicsDiscussed ? JSON.parse(conversation.topicsDiscussed) : undefined,
      },
      verifiedCommerceContext: productSearch.promptContext,
      botConfig: {
        companyName: conversation.chatbot.companyName,
        promptTemplateId: conversation.chatbot.promptTemplateId,
        systemPrompt: conversation.chatbot.systemPrompt,
        promptVariables: parseJSON(conversation.chatbot.promptVariables),
        role: chatbotSettings.role,
        objective: chatbotSettings.objective,
        personality: chatbotSettings.personality,
        rules: chatbotSettings.rules,
        forbiddenTopics: chatbotSettings.forbiddenTopics,
        forbiddenResponses: chatbotSettings.forbiddenResponses,
        handoffTriggers: chatbotSettings.handoffTriggers,
        leadCollectionFields: chatbotSettings.leadCollectionFields,
        language: chatbotSettings.language,
        tone: chatbotSettings.tone,
        responseLength: chatbotSettings.responseLength,
        fallbackMessage: chatbotSettings.fallbackMessage,
        handoffMessage: chatbotSettings.handoffMessage,
        aiModel: chatbotSettings.aiModel,
        temperature: chatbotSettings.temperature,
        maxTokens: chatbotSettings.maxTokens,
        retrievalMinScore: chatbotSettings.retrievalMinScore,
        groundingThreshold: chatbotSettings.groundingThreshold,
        rerankerEnabled: chatbotSettings.rerankerEnabled,
        liveWebSearchEnabled: chatbotSettings.liveWebSearchEnabled,
        liveWebAllowedDomains: chatbotSettings.liveWebAllowedDomains,
        ragCalibration: chatbotSettings.ragCalibration,
      }
    }
    
    // 🎯 MAGIC HAPPENS HERE - The orchestrator handles everything
    const result = await orchestrateResponse(orchestratorContext)
    for (const task of result.deferredTasks) after(task)
    const groundingBlocked = result.metadata.grounding.action === 'fallback'
    const effectiveIntent = commerceIntent !== 'none' ? commerceIntent : result.decision.intent.intent
    const workflowResult = incomingPolicy.action === 'allow' && !groundingBlocked
      ? await import('@/lib/workflow-engine').then(({ runActiveWorkflows }) => runActiveWorkflows({
        botId,
        conversationId: conversation.id,
        messageId: userMessage.id,
        message,
        intent: effectiveIntent,
        sentiment: currentSentiment,
      }))
      : { executed: [], failed: [], skipped: [], actions: [] }
    if (workflowResult.responseOverride) result.response = workflowResult.responseOverride
    const actionResult = incomingPolicy.action === 'allow' && !groundingBlocked
      ? await import('@/lib/action-engine').then(({ runTriggeredActions }) => runTriggeredActions({
        botId,
        conversationId: conversation.id,
        messageId: userMessage.id,
        message,
        intent: effectiveIntent,
      }))
      : { executed: [], failed: [], skipped: [], ctas: [], leadForms: [], channelMessages: [], handoffActivated: false }
    const outgoingPolicy = enforceOutgoingPolicy(result.response, chatbotSettings)
    const policyDecision = incomingPolicy.action !== 'allow' ? incomingPolicy : outgoingPolicy
    if (policyDecision.action !== 'allow') result.response = policyResponse(policyDecision, chatbotSettings)
    const resolvedProductCards: ProductCard[] = policyDecision.action === 'allow' && !groundingBlocked
      ? await hydrateProductCards(botId, productSearch.selections)
      : []
    const productCards = productSearch.query.wantsCards
      ? resolvedProductCards.slice(0, productSearch.query.maxCards)
      : []
    if (requiresCatalog && resolvedProductCards.length > 0) {
      result.response = buildVerifiedProductResponse(resolvedProductCards, commerceIntent, message)
      result.metadata.responseType = `verified_${commerceIntent}`
      result.metadata.confidence = commerceIntent === 'fit_advice' ? 0.85 : 1
    }
    
    console.log(`✅ [ChatAPI] Orchestrator completed in ${result.metadata.processingTimeMs}ms`)
    console.log(`   Strategy: ${result.metadata.responseType}`)
    console.log(`   Confidence: ${(result.metadata.confidence * 100).toFixed(0)}%`)
    console.log(`   Facts learned: ${result.extractedFacts.length}`)
    console.log(`   Sources used: ${result.sourcesUsed.length}`)

    // ========================================================================
    // STEP 6: EXTRACT UX ENHANCEMENTS FROM ORCHESTRATOR
    // ========================================================================
    
    const quickReplies = groundingBlocked
      ? [{ id: 'grounding-human', text: 'Vorrei parlare con una persona', category: 'support' as const }]
      : buildContextualQuickReplies({
          mode: businessMode,
          userMessage: message,
          assistantMessage: result.response,
          productCount: resolvedProductCards.length,
          commerceIntent,
        })

    // Never invent navigation targets from words in the answer. Every CTA must
    // come from an enabled owner-configured action with a validated HTTPS URL.
    const contextualCTAs = configuredCtasOnly(actionResult.ctas)

    console.log(`💡 [ChatAPI] UX Enhancements: ${quickReplies.length} quick replies, ${contextualCTAs.length} CTAs`)

    // ========================================================================
    // STEP 7: SAVE ASSISTANT MESSAGE
    // ========================================================================
    
    const messageMetadata = {
      intent: effectiveIntent,
      intentConfidence: commerceIntent !== 'none' ? 1 : result.decision.intent.confidence,
      responseType: result.metadata.responseType,
      confidence: result.metadata.confidence,
      responseStrategy: result.decision.responseStrategy,
      sourcesUsed: result.sourcesUsed.length,
      factsExtracted: result.extractedFacts.length,
      factsExtractionScheduled: result.metadata.phaseTimings.learningScheduled,
      processingTimeMs: result.metadata.processingTimeMs,
      phaseTimings: result.metadata.phaseTimings,
      workflowsExecuted: workflowResult.executed.length,
      workflowsFailed: workflowResult.failed,
      workflowsSkipped: workflowResult.skipped,
      workflowActions: workflowResult.actions,
      actionsExecuted: actionResult.executed,
      actionsFailed: actionResult.failed,
      actionsSkipped: actionResult.skipped,
      policyAction: policyDecision.action,
      policyCategory: policyDecision.category,
      groundingAction: result.metadata.grounding.action,
      groundingReason: result.metadata.grounding.reason,
      groundingEvidenceCount: result.metadata.grounding.evidenceCount,
      groundingThreshold: result.metadata.grounding.threshold,
      activeProductIds: resolvedProductCards.map((card) => card.productId),
      // Validation metadata
      ...(result.validationResult && {
        coherenceScore: result.validationResult.coherenceScore,
        conflicts: result.validationResult.conflicts.length,
        warnings: result.validationResult.warnings.length,
      }),
      // Retrieval metadata
      ...(result.retrievalResult && {
        persistentFactsUsed: result.retrievalResult.persistentFacts.length,
        knowledgeChunksUsed: result.retrievalResult.knowledgeChunks.length,
        retrievalSources: result.retrievalResult.source,
      }),
    }

    const savedAssistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: result.response,
        sourcesUsed: stringifyJSON({
          sources: result.sourcesUsed,
          metadata: messageMetadata
        }),
        quickReplies: stringifyJSON(quickReplies),
        ctaData: stringifyJSON(contextualCTAs),
        productCards: stringifyJSON(productCards),
      },
    })

    if (productCards.length > 0) {
      await prisma.commerceEvent.createMany({
        data: productCards.map((card) => ({
          botId,
          conversationId: conversation.id,
          messageId: savedAssistantMessage.id,
          productId: card.productId,
          variantId: card.variantId,
          eventType: 'impression',
          sessionId: conversation.userSessionId,
          pageUrl: pageContext?.url,
        })),
      })
    }

    // ========================================================================
    // STEP 8: UPDATE CONVERSATION METADATA
    // ========================================================================
    
    // Merge cognitive topics with tags written by workflows during this request.
    const latestConversation = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { topicsDiscussed: true },
    })
    const existingTopics = latestConversation?.topicsDiscussed ? JSON.parse(latestConversation.topicsDiscussed) : []
    const topics = Array.from(new Set([...existingTopics, ...result.decision.topics]))
    
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        userIntent: effectiveIntent,
        sentiment: currentSentiment,
        topicsDiscussed: topics.length > 0 ? JSON.stringify(topics) : null,
        ...(policyDecision.action === 'handoff' ? {
          needsHumanEscalation: true,
          escalatedAt: new Date(),
          escalationReason: `Policy agente: ${policyDecision.matchedRule}`,
        } : {}),
      },
    })
    if (policyDecision.action === 'handoff' && !actionResult.handoffActivated && !workflowResult.actions.includes('handoff')) {
      after(() => emitIntegrationWebhook({
        botId,
        event: 'conversation.handoff_requested',
        idempotencyKey: `chat-policy-handoff:${userMessage.id}`,
        payload: { conversationId: conversation.id, messageId: userMessage.id, reason: `Policy agente: ${policyDecision.matchedRule}` },
      }))
    }

    // ========================================================================
    // STEP 9: GET SOURCE DETAILS
    // ========================================================================
    
    let sourceDetails: any[] = []
    if (result.sourcesUsed.length > 0) {
      const sources = await prisma.knowledgeSource.findMany({
        where: {
          id: { in: result.sourcesUsed.map((s) => s.sourceId) },
        },
        select: {
          id: true,
          sourceType: true,
          sourceUrl: true,
          originalFilename: true,
        },
      })
      sourceDetails = sources
    }

    // ========================================================================
    // STEP 10: RETURN RESPONSE
    // ========================================================================

    console.log(JSON.stringify({
      event: 'chat.request.completed',
      requestId,
      botId,
      conversationId: conversation.id,
      durationMs: Date.now() - routeStartedAt,
      orchestratorMs: result.metadata.processingTimeMs,
      phases: result.metadata.phaseTimings,
      responseType: result.metadata.responseType,
      groundingAction: result.metadata.grounding.action,
      productsShown: productCards.length,
    }))

    return NextResponse.json({
      success: true,
      data: {
        conversationId: conversation.id,
        userMessage: {
          id: userMessage.id,
          content: userMessage.content,
          createdAt: userMessage.createdAt,
        },
        assistantMessage: {
          id: savedAssistantMessage.id,
          content: savedAssistantMessage.content,
          createdAt: savedAssistantMessage.createdAt,
        },
        sources: sourceDetails,
        
        // Intent & Classification
        intent: {
          type: effectiveIntent,
          confidence: commerceIntent !== 'none' ? 1 : result.decision.intent.confidence,
          reasoning: commerceIntent !== 'none' ? 'Intento commerce deterministico' : result.decision.intent.reasoning,
        },
        queryClassification: {
          type: result.decision.queryClassification.type,
          complexity: result.decision.queryClassification.complexity,
        },
        
        // Decision metadata
        decision: {
          strategy: result.decision.responseStrategy,
          sources: result.decision.retrievalPlan.sources,
          reasoning: result.decision.retrievalPlan.reasoning,
        },
        
        // Confidence & Quality
        confidence: {
          score: result.metadata.confidence,
          coherenceScore: result.validationResult?.coherenceScore,
          isCoherent: result.validationResult?.isCoherent,
        },
        grounding: result.metadata.grounding,
        handoffRequested: policyDecision.action === 'handoff',
        
        // Cognitive Memory
        memory: {
          persistentFactsUsed: result.retrievalResult?.persistentFacts.length || 0,
          knowledgeChunksUsed: result.retrievalResult?.knowledgeChunks.length || 0,
          factsExtracted: result.extractedFacts.length,
          factsExtractionScheduled: result.metadata.phaseTimings.learningScheduled,
        },
        
        // Validation (if available)
        ...(result.validationResult && {
          validation: {
            conflicts: result.validationResult.conflicts.length,
            warnings: result.validationResult.warnings.length,
            summary: result.validationResult.validationSummary,
          }
        }),
        
        // Response metadata
        responseType: result.metadata.responseType,
        processingTimeMs: result.metadata.processingTimeMs,
        phaseTimings: result.metadata.phaseTimings,
        workflow: workflowResult,
        actions: actionResult,
        
        // UX enhancements
        quickReplies: quickReplies,
        ctas: contextualCTAs,
        productCards,
      },
    })
  } catch (error) {
    console.error(JSON.stringify({
      event: 'chat.request.failed',
      requestId,
      durationMs: Date.now() - routeStartedAt,
      error: error instanceof Error ? error.message : 'unknown_error',
    }))
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process chat',
      },
      { status: 500 }
    )
  }
}
