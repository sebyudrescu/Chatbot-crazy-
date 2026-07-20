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

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MessageRole, type ChatbotSettings } from '@/lib/types'
import { stringifyJSON, parseJSON } from '@/lib/utils'
import { 
  orchestrateResponse, 
  type OrchestratorContext 
} from '@/lib/decision-orchestrator'
import { getOptimizedContext } from '@/lib/conversation-memory'
import { formatTokenUsage } from '@/lib/token-counter'
import { generateQuickReplies } from '@/lib/quick-replies-generator'
import { generateContextualCTAs } from '@/lib/cta-generator'
import { isAllowedWidgetOrigin } from '@/lib/widget-origin'
import { z } from 'zod'
import { checkRateLimit, requestClientIp } from '@/lib/rate-limit'

const ChatRequestSchema = z.object({
  botId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().nullable().optional(),
  userSessionId: z.string().max(300).optional(),
  source: z.enum(['widget']).optional(),
})

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

// POST /api/chat - Cognitive chat with structured memory
export async function POST(request: NextRequest) {
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
    if (
      body.source === 'widget' &&
      body.userSessionId &&
      existingConversation &&
      existingConversation.userSessionId !== body.userSessionId
    ) {
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
    const externalRequest = requestOrigin
      ? new URL(requestOrigin).hostname !== request.nextUrl.hostname
      : false
    if (body.source === 'widget' || externalRequest) {
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
    }
    
    // ========================================================================
    // STEP 1: CHECK KB STATUS
    // ========================================================================
    
    console.log(`\n🤖 [ChatAPI] New request for bot: ${botId}`)
    
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
    // STEP 2: GET OR CREATE CONVERSATION
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

    // ========================================================================
    // STEP 3: SAVE USER MESSAGE
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
      botConfig: {
        companyName: conversation.chatbot.companyName,
        promptTemplateId: conversation.chatbot.promptTemplateId,
        systemPrompt: conversation.chatbot.systemPrompt,
        promptVariables: parseJSON(conversation.chatbot.promptVariables),
        role: chatbotSettings.role,
        objective: chatbotSettings.objective,
        rules: chatbotSettings.rules,
        language: chatbotSettings.language,
        tone: chatbotSettings.tone,
        responseLength: chatbotSettings.responseLength,
        fallbackMessage: chatbotSettings.fallbackMessage,
        aiModel: chatbotSettings.aiModel,
        temperature: chatbotSettings.temperature,
        maxTokens: chatbotSettings.maxTokens,
      }
    }
    
    // 🎯 MAGIC HAPPENS HERE - The orchestrator handles everything
    const result = await orchestrateResponse(orchestratorContext)
    const { runActiveWorkflows } = await import('@/lib/workflow-engine')
    const workflowResult = await runActiveWorkflows({
      botId,
      conversationId: conversation.id,
      messageId: userMessage.id,
      message,
      intent: result.decision.intent.intent,
      sentiment: conversation.sentiment || undefined,
    })
    if (workflowResult.responseOverride) result.response = workflowResult.responseOverride
    const { runTriggeredActions } = await import('@/lib/action-engine')
    const actionResult = await runTriggeredActions({
      botId,
      conversationId: conversation.id,
      messageId: userMessage.id,
      message,
      intent: result.decision.intent.intent,
    })
    
    console.log(`✅ [ChatAPI] Orchestrator completed in ${result.metadata.processingTimeMs}ms`)
    console.log(`   Strategy: ${result.metadata.responseType}`)
    console.log(`   Confidence: ${(result.metadata.confidence * 100).toFixed(0)}%`)
    console.log(`   Facts learned: ${result.extractedFacts.length}`)
    console.log(`   Sources used: ${result.sourcesUsed.length}`)

    // ========================================================================
    // STEP 6: EXTRACT UX ENHANCEMENTS FROM ORCHESTRATOR
    // ========================================================================
    
    // Use quick replies from orchestrator if available (NEW cognitive system)
    // Otherwise fallback to old generators for backward compatibility
    const quickReplies = result.quickReplies || generateQuickReplies({
      lastUserMessage: message,
      lastAssistantMessage: result.response,
      conversationLength: conversation.messages.length + 2,
      topics: conversation.topicsDiscussed ? JSON.parse(conversation.topicsDiscussed) : undefined,
      userIntent: result.decision.intent.intent,
    })

    const contextualCTAs = [...actionResult.ctas, ...generateContextualCTAs({
      lastAssistantMessage: result.response,
      topics: conversation.topicsDiscussed ? JSON.parse(conversation.topicsDiscussed) : undefined,
      userIntent: result.decision.intent.intent,
    })].filter((item, index, all) => all.findIndex(candidate => candidate.action === item.action) === index)

    console.log(`💡 [ChatAPI] UX Enhancements: ${quickReplies.length} quick replies, ${contextualCTAs.length} CTAs`)

    // ========================================================================
    // STEP 7: SAVE ASSISTANT MESSAGE
    // ========================================================================
    
    const messageMetadata = {
      intent: result.decision.intent.intent,
      intentConfidence: result.decision.intent.confidence,
      responseType: result.metadata.responseType,
      confidence: result.metadata.confidence,
      responseStrategy: result.decision.responseStrategy,
      sourcesUsed: result.sourcesUsed.length,
      factsExtracted: result.extractedFacts.length,
      processingTimeMs: result.metadata.processingTimeMs,
      workflowsExecuted: workflowResult.executed.length,
      workflowsFailed: workflowResult.failed,
      workflowsSkipped: workflowResult.skipped,
      workflowActions: workflowResult.actions,
      actionsExecuted: actionResult.executed,
      actionsFailed: actionResult.failed,
      actionsSkipped: actionResult.skipped,
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
      },
    })

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
        userIntent: result.decision.intent.intent,
        sentiment: conversation.sentiment,
        topicsDiscussed: topics.length > 0 ? JSON.stringify(topics) : null,
      },
    })

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
    
    console.log(`✅ [ChatAPI] Request completed successfully\n`)

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
          type: result.decision.intent.intent,
          confidence: result.decision.intent.confidence,
          reasoning: result.decision.intent.reasoning,
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
        
        // Cognitive Memory
        memory: {
          persistentFactsUsed: result.retrievalResult?.persistentFacts.length || 0,
          knowledgeChunksUsed: result.retrievalResult?.knowledgeChunks.length || 0,
          factsExtracted: result.extractedFacts.length,
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
        workflow: workflowResult,
        actions: actionResult,
        
        // UX enhancements
        quickReplies: quickReplies,
        ctas: contextualCTAs,
      },
    })
  } catch (error) {
    console.error('❌ [ChatAPI] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process chat',
      },
      { status: 500 }
    )
  }
}
