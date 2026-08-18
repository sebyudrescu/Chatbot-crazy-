import "server-only";
import { prisma } from "@/lib/db";
import { orchestrateResponse, type OrchestratorContext } from "@/lib/decision-orchestrator";
import { orchestrateAgenticResponse } from "@/lib/agentic-orchestrator";
import { parseJSON, stringifyJSON } from "@/lib/utils";
import type { ChatbotSettings } from "@/lib/types";
import { enforceOutgoingPolicy, evaluateIncomingPolicy, policyResponse } from "@/lib/agent-policy";
import { checkRateLimit } from "@/lib/rate-limit";
import { detectSentiment } from "@/lib/sentiment";
import { parseOrderLookupMessage, redactOrderLookupMessage } from "@/lib/woocommerce-order-tracking";
import { tryVerifiedOrderLookup } from "@/lib/order-tracking";
import { hasVerifiedProductSource, searchVerifiedProducts } from "@/lib/product-search";
import { hydrateProductCards } from "@/lib/commerce-catalog";
import { buildVerifiedProductResponse } from "@/lib/verified-product-response";
import { emitIntegrationWebhook } from "@/lib/integration-webhooks";
import { buildCatalogFollowUpQuery, buildConversationalCommerceQuery, classifyCommerceIntent, isGenericStyleAdviceRequest, needsProductDiscoveryClarification, parseCommerceQuery } from "@/lib/commerce-query";
import { catalogUnavailableResponse, detectBusinessMode, isVerifiedCatalogIntent, productDiscoveryClarification, styleAdviceClarification } from "@/lib/conversation-guidance";
import { productCardsSchema } from "@/lib/commerce-types";
import { syncCRMContactFromConversation } from "@/lib/crm-sync";
import { escalateHelpDeskConversation, reopenHelpDeskConversation } from "@/lib/helpdesk-operations";

const CHANNEL_RATE_LIMIT = 30;
const CHANNEL_RATE_WINDOW_MS = 5 * 60_000;

function agenticCoreEnabled() {
  return process.env.AGENTIC_CORE_ENABLED !== "false";
}

function safeChannelResponse(value: string | undefined, fallback: string | undefined, channel: "whatsapp" | "instagram") {
  const text = (value || fallback || "Non riesco a completare la verifica in questo momento. Posso passarti a una persona del team.")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email protetta]")
    .replace(/\0/g, "")
    .trim();
  return text.slice(0, channel === "instagram" ? 1000 : 4000);
}
const CHANNEL_RATE_LIMIT_MESSAGE = "Ho ricevuto molti messaggi in poco tempo. Attendi qualche minuto prima di continuare, così potrò aiutarti correttamente.";

export async function processIncomingChannelMessage(input: { botId: string; channel: "whatsapp" | "instagram"; externalThreadId: string; externalMessageId: string; text: string; analysisText?: string; automationText?: string; userName?: string; userPhone?: string }) {
  const useAgenticCore = agenticCoreEnabled();
  const duplicate = await prisma.message.findUnique({ where: { externalMessageId: input.externalMessageId }, select: { id: true } });
  if (duplicate) return { duplicate: true as const };

  const conversation = await prisma.conversation.upsert({
    where: { botId_channel_externalThreadId: { botId: input.botId, channel: input.channel, externalThreadId: input.externalThreadId } },
    create: { botId: input.botId, userSessionId: `${input.channel}:${input.externalThreadId}`, channel: input.channel, externalThreadId: input.externalThreadId, userName: input.userName, userPhone: input.userPhone },
    update: { lastMessageAt: new Date(), ...(input.userName ? { userName: input.userName } : {}), ...(input.userPhone ? { userPhone: input.userPhone } : {}) },
    include: { chatbot: true, messages: { orderBy: { createdAt: "desc" }, take: 12 } },
  });

  const previousAssistantText = conversation.messages.find(message => message.role === "assistant")?.content || "";
  const parsedOrderLookup = parseOrderLookupMessage(input.text, previousAssistantText);
  const persistedUserText = redactOrderLookupMessage(input.text, parsedOrderLookup);
  const userMessage = await prisma.message.create({ data: { conversationId: conversation.id, role: "user", content: persistedUserText, channel: input.channel, externalMessageId: input.externalMessageId, deliveryStatus: "received" } });
  if (conversation.isResolved) {
    await reopenHelpDeskConversation({ botId: input.botId, conversationId: conversation.id });
    conversation.isResolved = false;
    conversation.needsHumanEscalation = false;
  }
  try {
    await syncCRMContactFromConversation(conversation.id);
  } catch (error) {
    console.error("CRM sync failed after channel message", {
      conversationId: conversation.id,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
  if (conversation.needsHumanEscalation && !conversation.isResolved) return { duplicate: false as const, handoff: true as const, conversationId: conversation.id };

  const channelLimitKey = `${input.botId}:${input.channel}:${input.externalThreadId}`;
  const messageLimit = await checkRateLimit(`channel-chat:${channelLimitKey}`, CHANNEL_RATE_LIMIT, CHANNEL_RATE_WINDOW_MS);
  if (!messageLimit.allowed) {
    const noticeLimit = await checkRateLimit(`channel-chat-notice:${channelLimitKey}`, 1, CHANNEL_RATE_WINDOW_MS);
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    if (!noticeLimit.allowed) return { duplicate: false as const, handoff: true as const, conversationId: conversation.id };
    const assistantMessage = await prisma.message.create({
      data: { conversationId: conversation.id, role: "assistant", content: CHANNEL_RATE_LIMIT_MESSAGE, channel: input.channel, deliveryStatus: "pending" },
    });
    return { duplicate: false as const, handoff: false as const, handoffActivated: false, conversationId: conversation.id, assistantMessageId: assistantMessage.id, response: CHANNEL_RATE_LIMIT_MESSAGE };
  }

  const runVerifiedOrderFallback = async () => {
    const orderLookup = await tryVerifiedOrderLookup({
      botId: input.botId,
      text: input.text,
      previousAssistantText,
      rateLimitScope: `${input.channel}:${input.externalThreadId}`,
    });
    if (!orderLookup.handled || !orderLookup.response) return null;
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: orderLookup.persistedResponse || orderLookup.response,
        channel: input.channel,
        deliveryStatus: "pending",
        sourcesUsed: stringifyJSON({ sources: [], metadata: { responseType: "verified_order_lookup", verified: orderLookup.verified, provider: orderLookup.provider, capability: orderLookup.capability } }),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        userIntent: "order_tracking",
      },
    });
    const handoff = orderLookup.handoff ? await escalateHelpDeskConversation({
      botId: input.botId,
      conversationId: conversation.id,
      reason: "Tracking ordine non disponibile sul canale automatico",
    }) : null;
    if (handoff?.transitioned) await emitIntegrationWebhook({
      botId: input.botId,
      event: "conversation.handoff_requested",
      idempotencyKey: `order-lookup-handoff:${conversation.id}:${handoff.conversation?.handoffSequence}`,
      payload: { conversationId: conversation.id, messageId: userMessage.id, reason: "Tracking ordine non disponibile sul canale automatico" },
    });
    return { duplicate: false as const, handoff: false as const, handoffActivated: Boolean(orderLookup.handoff), conversationId: conversation.id, assistantMessageId: assistantMessage.id, response: orderLookup.response };
  };
  if (!useAgenticCore) {
    const orderFallback = await runVerifiedOrderFallback();
    if (orderFallback) return orderFallback;
  }

  const settings = (parseJSON(conversation.chatbot.settings) || {}) as ChatbotSettings;
  const history = [...conversation.messages].reverse().map(message => ({ role: message.role, content: message.content }));
  const query = input.analysisText?.trim() || input.text;
  const automationMessage = input.automationText?.trim() || input.text;
  const incomingPolicy = evaluateIncomingPolicy(automationMessage, settings);
  if (incomingPolicy.action !== "allow") {
    const response = policyResponse(incomingPolicy, settings);
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: response,
        channel: input.channel,
        deliveryStatus: "pending",
        sourcesUsed: stringifyJSON({ sources: [], metadata: { policyAction: incomingPolicy.action, policyCategory: incomingPolicy.category } }),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
      },
    });
    const handoff = incomingPolicy.action === "handoff" ? await escalateHelpDeskConversation({
      botId: input.botId,
      conversationId: conversation.id,
      reason: `Policy agente: ${incomingPolicy.matchedRule}`,
    }) : null;
    if (handoff?.transitioned) await emitIntegrationWebhook({
      botId: input.botId,
      event: "conversation.handoff_requested",
      idempotencyKey: `channel-policy-handoff:${conversation.id}:${handoff.conversation?.handoffSequence}`,
      payload: { conversationId: conversation.id, messageId: userMessage.id, reason: `Policy agente: ${incomingPolicy.matchedRule}` },
    });
    return {
      duplicate: false as const,
      handoff: false as const,
      handoffActivated: incomingPolicy.action === "handoff",
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id,
      response,
    };
  }
  const botConfig: OrchestratorContext["botConfig"] = {
    companyName: conversation.chatbot.companyName,
    promptTemplateId: conversation.chatbot.promptTemplateId,
    systemPrompt: conversation.chatbot.systemPrompt,
    promptVariables: parseJSON(conversation.chatbot.promptVariables),
    role: settings.role,
    objective: settings.objective,
    personality: settings.personality,
    rules: settings.rules,
    forbiddenTopics: settings.forbiddenTopics,
    forbiddenResponses: settings.forbiddenResponses,
    handoffTriggers: settings.handoffTriggers,
    leadCollectionFields: settings.leadCollectionFields,
    language: settings.language,
    tone: settings.tone,
    responseLength: settings.responseLength,
    fallbackMessage: settings.fallbackMessage,
    handoffMessage: settings.handoffMessage,
    aiModel: settings.aiModel,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    retrievalMinScore: settings.retrievalMinScore,
    groundingThreshold: settings.groundingThreshold,
    rerankerEnabled: settings.rerankerEnabled,
    liveWebSearchEnabled: settings.liveWebSearchEnabled,
    liveWebAllowedDomains: settings.liveWebAllowedDomains,
    ragCalibration: settings.ragCalibration,
  };
  const baseContext: OrchestratorContext = {
    botId: input.botId,
    conversationId: conversation.id,
    query,
    conversationHistory: history,
    conversationMetadata: {
      userIntent: conversation.userIntent || undefined,
      sentiment: conversation.sentiment || undefined,
      topics: parseJSON<string[]>(conversation.topicsDiscussed) || undefined,
    },
    botConfig,
  };

  if (useAgenticCore) {
    let agentResult: Awaited<ReturnType<typeof orchestrateAgenticResponse>> | null = null;
    try {
      agentResult = await orchestrateAgenticResponse({
        ...baseContext,
        messageId: userMessage.id,
        rateLimitScope: `${input.channel}:${input.externalThreadId}`,
        previousAssistantText,
      });
    } catch (error) {
      console.error("[channel-agentic] orchestrator fallback", {
        botId: input.botId,
        channel: input.channel,
        error: error instanceof Error ? error.name : "unknown_error",
      });
      const orderFallback = await runVerifiedOrderFallback();
      if (orderFallback) return orderFallback;
    }

    if (agentResult) {
      let response = safeChannelResponse(agentResult.response, settings.fallbackMessage, input.channel);
      const preliminaryPolicy = enforceOutgoingPolicy(response, settings);
      const currentSentiment = detectSentiment(automationMessage);
      const sideEffectsBlocked = preliminaryPolicy.action !== "allow" || agentResult.handoff;
      const workflow = sideEffectsBlocked
        ? { executed: [], failed: [], skipped: [], actions: [] }
        : await import("@/lib/workflow-engine").then(({ runActiveWorkflows }) => runActiveWorkflows({
          botId: input.botId,
          conversationId: conversation.id,
          messageId: userMessage.id,
          message: automationMessage,
          intent: agentResult.intent,
          sentiment: currentSentiment,
        }));
      if (workflow.responseOverride) response = safeChannelResponse(workflow.responseOverride, settings.fallbackMessage, input.channel);
      const actionResult = sideEffectsBlocked
        ? { executed: [], failed: [], skipped: [], ctas: [], leadForms: [], channelMessages: [], handoffActivated: false, forceProductCards: false, orderLookupForm: false, productWidget: null }
        : await import("@/lib/action-engine").then(({ runTriggeredActions }) => runTriggeredActions({
          botId: input.botId,
          conversationId: conversation.id,
          messageId: userMessage.id,
          message: automationMessage,
          intent: agentResult.intent,
        }));
      const channelActionText = actionResult.channelMessages.filter((message) => message.trim()).join("\n\n");
      if (channelActionText && !response.includes(channelActionText)) {
        response = safeChannelResponse([response, channelActionText].filter(Boolean).join("\n\n"), settings.fallbackMessage, input.channel);
      }
      const policyDecision = enforceOutgoingPolicy(response, settings);
      if (policyDecision.action !== "allow") response = safeChannelResponse(policyResponse(policyDecision, settings), settings.fallbackMessage, input.channel);
      const parsedCards = productCardsSchema.safeParse(agentResult.productCards);
      const productCards = policyDecision.action === "allow" && !agentResult.handoff && parsedCards.success ? parsedCards.data : [];
      const handoffActivated = agentResult.handoff
        || policyDecision.action === "handoff"
        || actionResult.handoffActivated
        || workflow.actions.includes("handoff");
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: response,
          channel: input.channel,
          deliveryStatus: "pending",
          sourcesUsed: stringifyJSON({
            sources: agentResult.sources,
            metadata: {
              architecture: "agentic",
              intent: agentResult.intent,
              confidence: agentResult.confidence,
              responseType: agentResult.responseType,
              model: agentResult.model,
              processingTimeMs: agentResult.processingTimeMs,
              toolTrace: agentResult.toolTrace.map(({ name, durationMs, success, resultCount }) => ({ name, durationMs, success, resultCount })),
              workflowsExecuted: workflow.executed,
              workflowActions: workflow.actions,
              actionsExecuted: actionResult.executed,
              actionsFailed: actionResult.failed,
            },
          }),
          productCards: stringifyJSON(productCards),
        },
      });
      if (productCards.length) {
        await prisma.commerceEvent.createMany({
          data: productCards.map(card => ({
            botId: input.botId,
            conversationId: conversation.id,
            messageId: assistantMessage.id,
            productId: card.productId,
            variantId: card.variantId,
            eventType: "impression",
            sessionId: conversation.userSessionId,
          })),
        });
      }
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          userIntent: agentResult.intent,
          sentiment: currentSentiment,
        },
      });
      const agentHandoff = handoffActivated ? await escalateHelpDeskConversation({
        botId: input.botId,
        conversationId: conversation.id,
        reason: policyDecision.action === "handoff"
          ? `Policy agente: ${policyDecision.matchedRule}`
          : "Handoff richiesto dall'orchestratore agentico",
      }) : null;
      if (agentHandoff?.transitioned && !actionResult.handoffActivated && !workflow.actions.includes("handoff")) {
        await emitIntegrationWebhook({
          botId: input.botId,
          event: "conversation.handoff_requested",
          idempotencyKey: `channel-agentic-handoff:${conversation.id}:${agentHandoff.conversation?.handoffSequence}`,
          payload: { conversationId: conversation.id, messageId: userMessage.id, reason: "Handoff richiesto dall'orchestratore agentico" },
        });
      }
      return {
        duplicate: false as const,
        handoff: false as const,
        handoffActivated,
        conversationId: conversation.id,
        assistantMessageId: assistantMessage.id,
        response,
        productCards,
        orderLookupForm: agentResult.orderLookupForm,
        orderStatusCard: agentResult.orderStatusCard,
      };
    }
  }

  const configuredBusinessMode = detectBusinessMode([
    conversation.chatbot.companyName,
    conversation.chatbot.systemPrompt,
    conversation.chatbot.promptTemplateId,
    settings.role,
    settings.objective,
  ].filter(Boolean).join(" "));
  const hasCommerceSource = await hasVerifiedProductSource(input.botId);
  const businessMode = hasCommerceSource ? "commerce" : configuredBusinessMode;
  const previousUserMessages = conversation.messages
    .filter(message => message.role === "user")
    .reverse()
    .map(message => message.content);
  const conversationalCommerceQuery = buildConversationalCommerceQuery(query, previousUserMessages, businessMode === "commerce");
  const classifiedCommerceIntent = classifyCommerceIntent(conversationalCommerceQuery, businessMode === "commerce");
  const catalogFollowUpQuery = buildCatalogFollowUpQuery(
    query,
    previousUserMessages,
    businessMode === "commerce",
  );
  const commerceIntent = classifiedCommerceIntent !== "none"
    ? classifiedCommerceIntent
    : catalogFollowUpQuery
      ? "product_discovery"
      : "none";
  const commerceSearchQuery = catalogFollowUpQuery || conversationalCommerceQuery;
  const productSearch = await searchVerifiedProducts(input.botId, commerceSearchQuery, undefined, { intent: commerceIntent });
  const needsStyleClarification = commerceIntent === "fit_advice" && isGenericStyleAdviceRequest(query);
  const parsedCommerceQuery = parseCommerceQuery(commerceSearchQuery, businessMode === "commerce");
  const needsProductClarification = commerceIntent === "product_discovery"
    && needsProductDiscoveryClarification(commerceSearchQuery, parsedCommerceQuery)
    && (!parsedCommerceQuery.category || productSearch.selections.length > 0);
  const requiresCatalog = isVerifiedCatalogIntent(commerceIntent);
  if (needsStyleClarification || needsProductClarification || (requiresCatalog && productSearch.selections.length === 0)) {
    const response = needsStyleClarification
      ? styleAdviceClarification()
      : needsProductClarification
        ? productDiscoveryClarification(parsedCommerceQuery.category)
        : catalogUnavailableResponse(productSearch.catalogSize);
    const responseType = needsStyleClarification
      ? "style_advice_clarification"
      : needsProductClarification
        ? "product_discovery_clarification"
        : productSearch.catalogSize === 0 ? "verified_catalog_unavailable" : "verified_catalog_no_match";
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: response,
        channel: input.channel,
        deliveryStatus: "pending",
        sourcesUsed: stringifyJSON({ sources: [], metadata: { responseType, verified: true } }),
        productCards: stringifyJSON([]),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), userIntent: "product_search", sentiment: detectSentiment(automationMessage) },
    });
    return {
      duplicate: false as const,
      handoff: false as const,
      handoffActivated: false,
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id,
      response,
      productCards: [],
    };
  }
  const context: OrchestratorContext = {
    ...baseContext,
    verifiedCommerceContext: productSearch.promptContext,
  };
  const result = await orchestrateResponse(context);
  const groundingBlocked = result.metadata.grounding.action === "fallback";
  const currentSentiment = detectSentiment(automationMessage);
  const workflow = groundingBlocked
    ? { executed: [], failed: [], skipped: [], actions: [] }
    : await import("@/lib/workflow-engine").then(({ runActiveWorkflows }) => runActiveWorkflows({ botId: input.botId, conversationId: conversation.id, messageId: userMessage.id, message: automationMessage, intent: result.decision.intent.intent, sentiment: currentSentiment }));
  if (workflow.responseOverride) result.response = workflow.responseOverride;
  const actionResult = groundingBlocked
    ? { executed: [], failed: [], skipped: [], ctas: [], leadForms: [], channelMessages: [], handoffActivated: false, forceProductCards: false, orderLookupForm: false, productWidget: null }
    : await import("@/lib/action-engine").then(({ runTriggeredActions }) => runTriggeredActions({ botId: input.botId, conversationId: conversation.id, messageId: userMessage.id, message: automationMessage, intent: result.decision.intent.intent }));
  const channelActionText = actionResult.channelMessages.filter((message) => message.trim()).join("\n\n");
  if (channelActionText && !result.response.includes(channelActionText)) {
    result.response = [result.response.trim(), channelActionText].filter(Boolean).join("\n\n");
  }
  const outgoingPolicy = enforceOutgoingPolicy(result.response, settings);
  const policyDecision = outgoingPolicy;
  if (policyDecision.action !== "allow") result.response = policyResponse(policyDecision, settings);
  const productCards = policyDecision.action === "allow" && (!groundingBlocked || (requiresCatalog && productSearch.selections.length > 0))
    ? await hydrateProductCards(input.botId, productSearch.selections)
    : [];
  if (requiresCatalog && productCards.length > 0) {
    result.response = buildVerifiedProductResponse(productCards, commerceIntent, query);
    result.metadata.responseType = "verified_product_catalog";
    result.metadata.confidence = 1;
  }

  const assistantMessage = await prisma.message.create({
    data: { conversationId: conversation.id, role: "assistant", content: result.response, channel: input.channel, deliveryStatus: "pending", sourcesUsed: stringifyJSON({ sources: result.sourcesUsed, metadata: { intent: result.decision.intent.intent, confidence: result.metadata.confidence, responseType: result.metadata.responseType, grounding: result.metadata.grounding, workflowsExecuted: workflow.executed, workflowActions: workflow.actions, actionsExecuted: actionResult.executed, actionsFailed: actionResult.failed } }), productCards: stringifyJSON(productCards) },
  });

  if (productCards.length) {
    await prisma.commerceEvent.createMany({
      data: productCards.map(card => ({ botId: input.botId, conversationId: conversation.id, messageId: assistantMessage.id, productId: card.productId, variantId: card.variantId, eventType: "impression", sessionId: conversation.userSessionId })),
    });
  }
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      userIntent: result.decision.intent.intent,
      sentiment: currentSentiment,
      topicsDiscussed: stringifyJSON(Array.from(new Set([...(parseJSON<string[]>(conversation.topicsDiscussed) || []), ...result.decision.topics]))),
    },
  });
  const policyHandoff = policyDecision.action === "handoff" ? await escalateHelpDeskConversation({
    botId: input.botId,
    conversationId: conversation.id,
    reason: `Policy agente: ${policyDecision.matchedRule}`,
  }) : null;
  if (policyHandoff?.transitioned && !actionResult.handoffActivated && !workflow.actions.includes("handoff")) {
    await emitIntegrationWebhook({
      botId: input.botId,
      event: "conversation.handoff_requested",
      idempotencyKey: `channel-outgoing-policy-handoff:${conversation.id}:${policyHandoff.conversation?.handoffSequence}`,
      payload: { conversationId: conversation.id, messageId: userMessage.id, reason: `Policy agente: ${policyDecision.matchedRule}` },
    });
  }
  return { duplicate: false as const, handoff: false as const, handoffActivated: policyDecision.action === "handoff" || actionResult.handoffActivated || workflow.actions.includes("handoff"), conversationId: conversation.id, assistantMessageId: assistantMessage.id, response: result.response, productCards };
}
