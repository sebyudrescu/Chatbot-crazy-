import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { prisma } from '@/lib/db'
import { MessageRole } from '@/lib/types'
import { stringifyJSON } from '@/lib/utils'
import { queryKnowledgeBase } from '@/lib/rag-pipeline'
import { 
  calculateConfidence, 
  generateFallbackMessage,
  formatSourceCitations,
  type ChunkWithScore 
} from '@/lib/confidence-scoring'
import { 
  classifyIntent,
  generateIntentResponse,
  isFollowUpQuestion 
} from '@/lib/intent-classifier'
import {
  advancedRetrieve,
  prepareChunksForAdvancedRAG,
  type RerankResult
} from '@/lib/advanced-rag'
import {
  extractUserData,
  analyzeConversationMetadata,
  getOptimizedContext,
  shouldAnalyzeMetadata,
  mergeUserData,
  formatExtractedData
} from '@/lib/conversation-memory'
import {
  extractRichFacts,
  storeFactsWithEmbeddings,
  recallRelevantFacts,
  formatFactsForPrompt
} from '@/lib/vectorized-fact-memory'
import { formatTokenUsage } from '@/lib/token-counter'
import { generateSystemPrompt, buildRAGSystemPrompt, buildConfidenceAwareRAGPrompt } from '@/lib/prompt-manager'
import { parseJSON } from '@/lib/utils'
import { classifyQuery } from '@/lib/query-classifier'
import { getOptimalParams, logParams } from '@/lib/openai-params-manager'
import { generateQuickReplies, shouldEscalate } from '@/lib/quick-replies-generator'
import { generateContextualCTAs } from '@/lib/cta-generator'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// POST /api/chat - Send a message and get AI response with RAG
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, message, botId } = body

    if (!message || !botId) {
      return NextResponse.json(
        { success: false, error: 'Message and botId are required' },
        { status: 400 }
      )
    }
    
    // CRITICAL: Check if KB is ready before processing chat
    const { isBotReady } = await import('@/lib/ingestion-queue')
    const kbStatus = await isBotReady(botId)
    
    if (!kbStatus.ready) {
      // KB not ready - return helpful message
      console.log(`⚠️ KB not ready for bot ${botId}: ${kbStatus.status}`)
      return NextResponse.json({
        success: false,
        error: 'knowledge_base_not_ready',
        kbStatus: kbStatus.status,
        message: kbStatus.message,
        suggestion: kbStatus.status === 'indexing' 
          ? 'Please wait a few moments while we finish indexing your knowledge base.'
          : kbStatus.status === 'empty'
          ? 'Please add some documents to the knowledge base first.'
          : 'There was an error indexing your knowledge base. Please try re-uploading your documents.'
      }, { status: 503 }) // Service Unavailable
    }
    
    console.log(`✅ KB ready for bot ${botId} with ${kbStatus.totalChunks} chunks`)

    // Get or create conversation
    let conversation
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20, // Last 20 messages for better context retention
          },
          chatbot: true,
        },
      })
    } else {
      // Create new conversation
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

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: message,
      },
    })

    // === STEP 1: CONVERSATION MEMORY - Get optimized context ===
    console.log(`🧠 Managing conversation memory (${conversation.messages.length} messages)`)
    
    // Get all messages for context optimization
    const allMessages = conversation.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))

    // Optimize context with TOKEN-BASED + PROGRESSIVE summarization
    const { contextMessages, summary, wasSummarized, usedTokens } = await getOptimizedContext(
      allMessages,
      {
        maxMessages: 8,
        maxTokens: 3000, // Leave room for response (GPT-3.5 has 4096 context)
        enableSummarization: true,
        summaryThreshold: 10,
        existingSummary: conversation.summary || undefined, // Progressive summarization
        enableTokenCounting: true,
      }
    )

    if (wasSummarized) {
      console.log(`📝 Conversation summarized (${allMessages.length} → ${contextMessages.length} messages)`)
      console.log(`📊 Token usage: ${formatTokenUsage(usedTokens || 0, 4096)}`)
      
      // Save summary to database
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          summary: summary,
          lastSummaryAt: new Date(),
        },
      })
    } else if (usedTokens) {
      console.log(`📊 Token usage: ${formatTokenUsage(usedTokens, 4096)}`)
    }

    // SMART FACT RECALL: retrieve relevant facts for current query
    const relevantFacts = await recallRelevantFacts(conversation.id, message, 3)
    const factsContext = formatFactsForPrompt(relevantFacts)
    
    if (factsContext) {
      console.log(`🧠 Recalled ${relevantFacts.length} relevant facts for personalization`)
    }

    const conversationHistory = contextMessages

    // === STEP 2: INTENT & QUERY CLASSIFICATION ===
    console.log(`🎭 Classifying intent for message: "${message}"`)
    
    const intentResult = await classifyIntent(message, conversationHistory)
    const queryClassification = classifyQuery(message)
    
    console.log(`🎯 Intent Classification:`, {
      intent: intentResult.intent,
      confidence: intentResult.confidence.toFixed(2),
      shouldUseRAG: intentResult.shouldUseRAG,
      reasoning: intentResult.reasoning
    })
    
    console.log(`📊 Query Classification:`, {
      type: queryClassification.type,
      complexity: queryClassification.complexity,
      confidence: queryClassification.confidence.toFixed(2),
      reasoning: queryClassification.reasoning
    })

    let assistantMessage: string
    let sourcesUsed: any[] = []
    let confidenceScore = intentResult.confidence
    let responseType: string = intentResult.intent
    let relevantChunks: any[] = []
    let confidenceResult: any = null

    // === STEP 3: ROUTE BASED ON INTENT ===

    if (!intentResult.shouldUseRAG) {
      // NON-RAG intents: greeting, chitchat, escalation
      console.log(`💬 Handling ${intentResult.intent} without RAG`)
      
      // === BUSINESS CONTEXT for non-RAG responses too ===
      const { getCachedBusinessContext } = await import('@/lib/business-context')
      const businessContext = await getCachedBusinessContext(botId)
      
      assistantMessage = await generateIntentResponse(
        intentResult.intent,
        message,
        conversation.chatbot.companyName,
        conversationHistory,
        businessContext // Pass business context to intent handler
      )
      
      responseType = intentResult.intent
      confidenceScore = intentResult.confidence

    } else {
      // RAG PIPELINE for questions
      console.log(`🔍 Starting RAG pipeline for question: "${message}"`)
      
      // Check if it's a follow-up question (might need more context)
      const isFollowUp = isFollowUpQuestion(message, conversationHistory)
      if (isFollowUp) {
        console.log(`🔗 Detected follow-up question - including conversation context`)
      }

      // Query knowledge base with improved embeddings
      const rawChunks = await queryKnowledgeBase(botId, message, {
        topK: 100, // More candidates for better recall - INCREASED from 50
        minScore: 0.20, // Lower threshold to catch more relevant chunks - DECREASED from 0.30
      })

      console.log(`📊 Raw retrieval: ${rawChunks.length} chunks`)

      // Prepare chunks for advanced RAG
      const preparedChunks = prepareChunksForAdvancedRAG(rawChunks)

      // Extract conversation context for contextual reranking
      const contextMessages = conversationHistory
        .slice(-3) // Last 3 messages for context
        .map(msg => msg.content)

      // ADVANCED RAG: Multi-stage retrieval + deduplication + reranking
      const advancedResults = await advancedRetrieve(message, preparedChunks, {
        topK: 5, // Final top 5 chunks
        enableKeywordSearch: true,
        enableDeduplication: true,
        conversationContext: isFollowUp ? contextMessages : [],
        minSemanticScore: 0.3,
      })

      // Convert advanced results back to standard format
      relevantChunks = advancedResults.map(result => ({
        text: result.text,
        score: result.finalScore, // Use fused score
        metadata: result.metadata,
      }))

      console.log(`🎯 Advanced RAG: ${relevantChunks.length} final chunks`)

      // Calculate confidence score
      const chunksWithScore: ChunkWithScore[] = relevantChunks.map(chunk => ({
        text: chunk.text,
        score: chunk.score,
        metadata: chunk.metadata
      }))

      // IMPROVED: Higher thresholds with better retrieval system
      confidenceResult = calculateConfidence(chunksWithScore, {
        minTopScore: 0.65,      // Raised from 0.55 (better embeddings allow this)
        minAvgScore: 0.55,      // Raised from 0.45
        minHighQualityChunks: 2 // At least 2 high-quality chunks
      })

      console.log(`🎯 Confidence Analysis:`, {
        overallConfidence: confidenceResult.overallConfidence.toFixed(2),
        shouldRespond: confidenceResult.shouldRespond,
        reason: confidenceResult.reason,
        topScore: confidenceResult.metrics.topChunkScore.toFixed(2),
        avgScore: confidenceResult.metrics.avgTopChunksScore.toFixed(2),
        highQualityChunks: confidenceResult.metrics.numHighQualityChunks
      })

      confidenceScore = confidenceResult.overallConfidence

      // Decide: respond with RAG or use fallback
      if (confidenceResult.shouldRespond && relevantChunks.length > 0) {
        console.log(`✅ Confidence sufficient - generating RAG response`)
        responseType = 'rag_answer'
      // 4. Build context from retrieved chunks (already filtered by advanced RAG)
      const topChunks = relevantChunks
      
      const context = topChunks
        .map((chunk, i) => {
          // Show detailed scoring for advanced RAG results
          const advResult = advancedResults[i]
          const scoreBreakdown = advResult ? 
            `S:${Math.round(advResult.semanticScore * 100)}% K:${Math.round(advResult.keywordScore * 100)}%` : 
            ''
          
          return `[Fonte ${i + 1}] (Rilevanza: ${Math.round(chunk.score * 100)}% ${scoreBreakdown})
${chunk.text}`
        })
        .join('\n\n---\n\n')

      // 5. Extract unique sources
      const sourcesMap = new Map<string, any>()
      for (const chunk of topChunks) {
        const sourceId = chunk.metadata.sourceId
        if (!sourcesMap.has(sourceId) || sourcesMap.get(sourceId).score < chunk.score) {
          sourcesMap.set(sourceId, {
            sourceId,
            sourceType: chunk.metadata.sourceType,
            score: chunk.score,
          })
        }
      }
      sourcesUsed = Array.from(sourcesMap.values())

      // 6. Format source citations
      const { citationText } = formatSourceCitations(chunksWithScore)

      // 7. Build conversation messages for OpenAI
      const conversationMessages = conversationHistory
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }))

      // Add current user message
      conversationMessages.push({
        role: 'user',
        content: message,
      })

      // 8. Generate system prompt using template system
      const baseSystemPrompt = generateSystemPrompt({
        promptTemplateId: conversation.chatbot.promptTemplateId,
        systemPrompt: conversation.chatbot.systemPrompt,
        promptVariables: parseJSON(conversation.chatbot.promptVariables),
        companyName: conversation.chatbot.companyName,
      })

      // === BUSINESS CONTEXT INJECTION (CRITICAL!) ===
      const { getCachedBusinessContext, formatBusinessContextForPrompt } = await import('@/lib/business-context')
      const businessContext = await getCachedBusinessContext(botId)
      const businessPromptSection = formatBusinessContextForPrompt(businessContext)
      
      console.log(`🏢 Business context injected for: ${businessContext.companyName}`)

      // Add personalization context if we have recalled facts
      let personalizedPrompt = baseSystemPrompt
      
      // ALWAYS add business context FIRST (bot identity)
      personalizedPrompt += businessPromptSection
      
      if (factsContext) {
        personalizedPrompt += `

---

# INFORMAZIONI UTENTE (Personalizzazione)

Le seguenti informazioni sull'utente possono essere utilizzate per personalizzare la risposta:

${factsContext}

• Usa queste informazioni per rendere la risposta più pertinente
• Fai riferimento alle preferenze/interessi quando rilevanti
• Sii empatico verso problemi precedentemente espressi`
      }

      // Build final RAG-enhanced prompt with context sources
      const ragSources = relevantChunks.map((chunk, index) => ({
        id: `source-${index}`,
        content: chunk.text,
        relevance: chunk.score,
      }))

      // Use ANTI-HALLUCINATION prompting for maximum safety
      const { buildAntiHallucinationPrompt } = await import('@/lib/anti-hallucination-prompts')
      
      const systemPrompt = buildAntiHallucinationPrompt({
        baseSystemPrompt: personalizedPrompt,
        retrievedSources: ragSources,
        confidenceScore: confidenceScore,
        companyName: conversation.chatbot.companyName,
        queryType: queryClassification.type
      })

      // Adaptive temperature based on confidence (lower = more conservative)
      const adaptiveTemperature = confidenceScore >= 0.7 ? 0.3 : 
                                  confidenceScore >= 0.5 ? 0.2 : 0.1
      
      // Adaptive max tokens (more conservative for low confidence)
      const adaptiveMaxTokens = confidenceScore >= 0.7 ? 500 : 
                                confidenceScore >= 0.5 ? 400 : 300

      console.log(`🎯 Anti-Hallucination Mode:`, {
        temperature: adaptiveTemperature,
        maxTokens: adaptiveMaxTokens,
        confidenceScore: confidenceScore.toFixed(2),
        strictness: confidenceScore >= 0.7 ? 'MODERATE' : confidenceScore >= 0.5 ? 'HIGH' : 'MAXIMUM'
      })

      // 9. Get optimal OpenAI parameters for RAG response
        const ragParams = getOptimalParams({
          intent: intentResult.intent,
          queryClassification,
          templateId: conversation.chatbot.promptTemplateId,
          conversationLength: conversationHistory.length,
        })
        
        // Override with confidence-aware adaptive parameters
        const finalParams = {
          ...ragParams,
          temperature: adaptiveTemperature,  // Adaptive based on confidence
          maxTokens: adaptiveMaxTokens       // Adaptive based on confidence
        }
        
        logParams(finalParams, {
          intent: intentResult.intent,
          queryClassification,
          templateId: conversation.chatbot.promptTemplateId,
          conversationLength: conversationHistory.length,
        } as any)
        
        // Call OpenAI with confidence-aware adaptive parameters
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversationMessages,
          ],
          temperature: finalParams.temperature,
          max_tokens: finalParams.maxTokens,
          top_p: finalParams.topP,
          presence_penalty: finalParams.presencePenalty,
          frequency_penalty: finalParams.frequencyPenalty,
        })

        const rawResponse = completion.choices[0]?.message?.content || 'No response'
        
        // Add citation footer
        assistantMessage = `${rawResponse}${citationText}`
        
        console.log(`✅ Generated RAG response with ${sourcesUsed.length} sources`)
      } else {
        // LOW CONFIDENCE - Use general AI without RAG
        console.log(`⚠️ Confidence too low - using general AI (reason: ${confidenceResult.reason})`)
        console.log(`📊 Debug: hasKB=${rawChunks.length > 0}, relevantChunks=${relevantChunks.length}`)
        
        // ALWAYS use general AI when confidence is low (don't use fallback)
        // This allows the bot to respond conversationally even without specific KB info
        
        // Build conversation messages
        const conversationMessages = conversationHistory
          .map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }))
        
        conversationMessages.push({
          role: 'user',
          content: message,
        })
        
        // Generate system prompt from template
        const systemPrompt = generateSystemPrompt({
          promptTemplateId: conversation.chatbot.promptTemplateId,
          systemPrompt: conversation.chatbot.systemPrompt,
          promptVariables: parseJSON(conversation.chatbot.promptVariables),
          companyName: conversation.chatbot.companyName,
        })
        
        console.log(`🎭 Using template: ${conversation.chatbot.promptTemplateId || 'default'}`)
        
        // Get optimal parameters for general AI response
        const generalParams = getOptimalParams({
          intent: intentResult.intent,
          queryClassification,
          templateId: conversation.chatbot.promptTemplateId,
          conversationLength: conversationHistory.length,
        })
        
        logParams(generalParams, {
          intent: intentResult.intent,
          queryClassification,
          templateId: conversation.chatbot.promptTemplateId,
          conversationLength: conversationHistory.length,
        })
        
        // Call OpenAI without RAG context but with dynamic parameters
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversationMessages,
          ],
          temperature: generalParams.temperature,
          max_tokens: generalParams.maxTokens,
          top_p: generalParams.topP,
          presence_penalty: generalParams.presencePenalty,
          frequency_penalty: generalParams.frequencyPenalty,
        })
        
        assistantMessage = completion.choices[0]?.message?.content || 'Mi dispiace, non riesco a rispondere al momento.'
        responseType = 'general_ai'
        confidenceScore = 0.5
        
        console.log(`✅ Generated general AI response (length: ${assistantMessage.length})`)
      }
    }

    // === GENERATE QUICK REPLIES & CTAs ===
    const quickReplies = generateQuickReplies({
      lastUserMessage: message,
      lastAssistantMessage: assistantMessage,
      conversationLength: conversation.messages.length + 2,
      topics: conversation.topicsDiscussed ? JSON.parse(conversation.topicsDiscussed) : undefined,
      userIntent: intentResult.intent,
    })

    const contextualCTAs = generateContextualCTAs({
      lastAssistantMessage: assistantMessage,
      topics: conversation.topicsDiscussed ? JSON.parse(conversation.topicsDiscussed) : undefined,
      userIntent: intentResult.intent,
    })

    console.log(`💡 Generated ${quickReplies.length} quick replies and ${contextualCTAs.length} CTAs`)

    // Save assistant message with intent and confidence metadata
    const messageMetadata = {
      intent: intentResult.intent,
      intentConfidence: intentResult.confidence,
      responseType: responseType,
      confidence: confidenceScore,
      ...(responseType === 'rag_answer' && {
        shouldRespond: confidenceResult.shouldRespond,
        reason: confidenceResult.reason,
        metrics: confidenceResult.metrics,
        chunksUsed: relevantChunks.length,
      }),
    }

    const savedAssistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: assistantMessage,
        sourcesUsed: stringifyJSON({
          sources: sourcesUsed,
          metadata: messageMetadata
        }),
        quickReplies: stringifyJSON(quickReplies),
        ctaData: stringifyJSON(contextualCTAs),
      },
    })

    // === STEP 4: EXTRACT USER DATA & RICH FACTS & ANALYZE METADATA ===
    const messageCount = conversation.messages.length + 2 // +2 for user + assistant just saved
    
    // Extract user data and analyze metadata periodically
    if (shouldAnalyzeMetadata(messageCount)) {
      console.log(`🔍 Analyzing conversation metadata (${messageCount} messages)`)
      
      try {
        // Get all messages including the new ones
        const allMessagesForAnalysis = [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: assistantMessage },
        ]

        // Extract user data (async, non-blocking)
        const extractedData = await extractUserData(allMessagesForAnalysis)
        
        if (Object.keys(extractedData).length > 0) {
          console.log(`👤 Extracted user data: ${formatExtractedData(extractedData)}`)
        }

        // Extract RICH FACTS (preferences, interests, problems, feedback)
        console.log(`🧠 Extracting rich facts from conversation...`)
        const richFacts = await extractRichFacts(allMessagesForAnalysis, conversation.id)
        
        if (richFacts.length > 0) {
          console.log(`✅ Extracted ${richFacts.length} rich facts`)
          // Store facts with embeddings (for vectorized memory)
          await storeFactsWithEmbeddings(richFacts)
        }

        // Analyze conversation metadata
        const metadata = await analyzeConversationMetadata(allMessagesForAnalysis)
        
        console.log(`📊 Metadata: intent=${metadata.userIntent}, sentiment=${metadata.sentiment}, resolved=${metadata.isResolved}`)

        // Merge with existing data (keep most recent non-null values)
        const existingData = {
          name: conversation.userName || undefined,
          email: conversation.userEmail || undefined,
          phone: conversation.userPhone || undefined,
          company: conversation.userCompany || undefined,
        }

        const mergedData = mergeUserData(existingData, extractedData)

        // Update conversation with extracted data and metadata
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            userName: mergedData.name || conversation.userName,
            userEmail: mergedData.email || conversation.userEmail,
            userPhone: mergedData.phone || conversation.userPhone,
            userCompany: mergedData.company || conversation.userCompany,
            userIntent: metadata.userIntent || conversation.userIntent,
            sentiment: metadata.sentiment || conversation.sentiment,
            isResolved: metadata.isResolved ?? conversation.isResolved,
            topicsDiscussed: metadata.topicsDiscussed 
              ? JSON.stringify(metadata.topicsDiscussed)
              : conversation.topicsDiscussed,
          },
        })
      } catch (error) {
        console.error('Error analyzing conversation metadata:', error)
        // Continue even if analysis fails
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        })
      }
    } else {
      // Just update lastMessageAt
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      })
    }

    // Get source details for response
    let sourceDetails: any[] = []
    if (sourcesUsed.length > 0) {
      const sources = await prisma.knowledgeSource.findMany({
        where: {
          id: { in: sourcesUsed.map((s) => s.sourceId) },
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
        relevantChunks: responseType === 'rag_answer' ? relevantChunks?.length || 0 : 0,
        // Intent classification metadata
        intent: {
          type: intentResult.intent,
          confidence: intentResult.confidence,
          reasoning: intentResult.reasoning,
        },
        // Anti-hallucination metadata (only for RAG responses)
        ...(responseType === 'rag_answer' && {
          confidence: {
            score: confidenceScore,
            shouldRespond: confidenceResult?.shouldRespond,
            reason: confidenceResult?.reason,
            metrics: confidenceResult?.metrics,
          },
        }),
        // Response metadata
        responseType: responseType,
        // UX enhancements
        quickReplies: quickReplies,
        ctas: contextualCTAs,
      },
    })
  } catch (error) {
    console.error('Error in chat:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process chat',
      },
      { status: 500 }
    )
  }
}
