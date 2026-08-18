import "server-only";

import { prisma } from "./db";
import {
  enforceOutgoingPolicy,
  policyResponse,
  type AgentPolicyDecision,
} from "./agent-policy";
import {
  orchestrateAgenticResponse,
  type AgenticResult,
} from "./agentic-orchestrator";
import type { OrchestratorContext } from "./decision-orchestrator";
import type { ChatbotSettings } from "./types";
import { stringifyJSON } from "./utils";
import type { ActionResult } from "./action-engine";
import { prepareWidgetsForMessage } from "./widget-message-persistence";
import { escalateHelpDeskConversation } from "./helpdesk-operations";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export interface AgenticChatRuntimeInput {
  context: OrchestratorContext;
  messageId: string;
  userMessage: { id: string; content: string; createdAt: Date };
  userSessionId: string;
  rateLimitScope: string;
  previousAssistantText?: string;
  incomingPolicy: AgentPolicyDecision;
  settings: ChatbotSettings;
  sentiment: string;
  pageUrl?: string;
}

function policyOnlyResult(
  policy: AgentPolicyDecision,
  settings: ChatbotSettings,
): AgenticResult {
  return {
    response: policyResponse(policy, settings),
    productCards: [],
    orderLookupForm: false,
    handoff: policy.action === "handoff",
    sources: [],
    toolTrace: [],
    model: "policy",
    processingTimeMs: 0,
    responseType: `policy_${policy.action}`,
    intent: policy.action === "handoff" ? "human_handoff" : "policy_blocked",
    confidence: 1,
    actions: {
      executed: [], failed: [], skipped: [], ctas: [], leadForms: [],
      channelMessages: [], handoffActivated: policy.action === "handoff",
      forceProductCards: false, orderLookupForm: false, productWidget: null,
      declarativeWidgets: [],
    },
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  };
}

function persistedDeclarativeWidgets(actions: ActionResult) {
  return prepareWidgetsForMessage(actions.declarativeWidgets);
}

export async function runAgenticChatTurn(input: AgenticChatRuntimeInput) {
  const agentResult = input.incomingPolicy.action === "allow"
    ? await orchestrateAgenticResponse({
        ...input.context,
        messageId: input.messageId,
        rateLimitScope: input.rateLimitScope,
        previousAssistantText: input.previousAssistantText,
      })
    : policyOnlyResult(input.incomingPolicy, input.settings);
  const outgoingPolicy = input.incomingPolicy.action === "allow"
    ? enforceOutgoingPolicy(agentResult.response, input.settings)
    : input.incomingPolicy;
  const policyDecision = input.incomingPolicy.action !== "allow"
    ? input.incomingPolicy
    : outgoingPolicy;
  const publicResponse = (policyDecision.action === "allow"
    ? agentResult.response
    : policyResponse(policyDecision, input.settings))
    .replace(EMAIL_PATTERN, "[email rimossa]");
  const persistedResponse = policyDecision.action === "allow"
    ? agentResult.persistedResponse || publicResponse
    : publicResponse;
  const handoffRequested = agentResult.handoff || policyDecision.action === "handoff";
  const visibleCards = policyDecision.action === "allow" ? agentResult.productCards : [];
  const quickReplies = handoffRequested
    ? [{ id: "handoff-confirmed", text: "Attendi un operatore", category: "support" as const }]
    : [];
  const visibleActions = policyDecision.action === "allow"
    ? agentResult.actions
    : policyOnlyResult(policyDecision, input.settings).actions;
  const declarativeWidgets = persistedDeclarativeWidgets(visibleActions);

  const savedAssistantMessage = await prisma.message.create({
    data: {
      conversationId: input.context.conversationId,
      role: "assistant",
      content: persistedResponse,
      sourcesUsed: stringifyJSON({
        sources: agentResult.sources,
        metadata: {
          responseType: agentResult.responseType,
          intent: agentResult.intent,
          confidence: agentResult.confidence,
          model: agentResult.model,
          agentic: true,
          toolTrace: agentResult.toolTrace,
          activeProductIds: visibleCards.map((card) => card.productId),
          policyAction: policyDecision.action,
          declarativeWidgets,
        },
      }),
      quickReplies: stringifyJSON(quickReplies),
      ctaData: stringifyJSON(visibleActions.ctas),
      productCards: stringifyJSON(visibleCards),
    },
  });
  if (visibleCards.length > 0) {
    await prisma.commerceEvent.createMany({
      data: visibleCards.map((card) => ({
        botId: input.context.botId,
        conversationId: input.context.conversationId,
        messageId: savedAssistantMessage.id,
        productId: card.productId,
        variantId: card.variantId,
        eventType: "impression",
        sessionId: input.userSessionId,
        pageUrl: input.pageUrl,
      })),
    });
  }
  await prisma.conversation.update({
    where: { id: input.context.conversationId },
    data: {
      lastMessageAt: new Date(),
      userIntent: agentResult.intent,
      sentiment: input.sentiment,
    },
  });
  const handoffTransition = handoffRequested && !input.context.evaluationMode
    ? await escalateHelpDeskConversation({
        botId: input.context.botId,
        conversationId: input.context.conversationId,
        reason: policyDecision.matchedRule
          ? `Policy agente: ${policyDecision.matchedRule}`
          : "Handoff richiesto dall'agente",
      })
    : null;
  const orderTool = agentResult.toolTrace.find((trace) => trace.name === "get_order_status");
  if (orderTool) {
    await prisma.event.create({
      data: {
        botId: input.context.botId,
        conversationId: input.context.conversationId,
        userId: input.userSessionId,
        eventType: agentResult.orderStatusCard
          ? "commerce.order_lookup.verified"
          : agentResult.orderLookupForm
            ? "commerce.order_lookup.verification_requested"
            : orderTool.success
              ? "commerce.order_lookup.no_match"
              : "commerce.order_lookup.failed",
        category: "conversation",
        severity: orderTool.success ? "info" : "warning",
        success: orderTool.success,
        durationMs: orderTool.durationMs,
        metadata: stringifyJSON({ providerLookup: true, protectedDataStored: false }),
      },
    });
  }

  const sourceIds = agentResult.sources
    .map((source) => source.sourceId)
    .filter((id): id is string => Boolean(id));
  const sourceDetails = sourceIds.length
    ? await prisma.knowledgeSource.findMany({
        where: { id: { in: sourceIds } },
        select: {
          id: true,
          sourceType: true,
          sourceUrl: true,
          originalFilename: true,
        },
      })
    : [];

  return {
    handoffRequested,
    handoffTransitioned: Boolean(handoffTransition?.transitioned),
    handoffSequence: handoffTransition?.conversation?.handoffSequence ?? null,
    handoffReason: policyDecision.matchedRule || "Handoff richiesto dall'agente",
    telemetry: {
      model: agentResult.model,
      durationMs: agentResult.processingTimeMs,
      tools: agentResult.toolTrace,
      productsShown: visibleCards.length,
    },
    data: {
      conversationId: input.context.conversationId,
      userMessage: input.userMessage,
      assistantMessage: {
        id: savedAssistantMessage.id,
        content: publicResponse,
        createdAt: savedAssistantMessage.createdAt,
      },
      sources: sourceDetails,
      intent: {
        type: agentResult.intent,
        confidence: agentResult.confidence,
        reasoning: "Decisione semantica dell'orchestratore LLM tramite tool calling",
      },
      queryClassification: {
        type: agentResult.toolTrace.length ? "tool_assisted" : "conversational",
        complexity: agentResult.toolTrace.length > 1 ? "complex" : "simple",
      },
      decision: {
        strategy: "agentic_tool_calling",
        sources: agentResult.toolTrace.map((trace) => trace.name),
        reasoning: "Il modello ha scelto autonomamente i tool necessari",
      },
      confidence: { score: agentResult.confidence, isCoherent: true },
      grounding: {
        action: policyDecision.action === "allow" ? "allow" : "fallback",
        reason: policyDecision.matchedRule || "verified_tool_results",
        evidenceCount:
          agentResult.sources.length +
          visibleCards.length +
          (agentResult.orderStatusCard ? 1 : 0),
      },
      handoffRequested,
      memory: {
        persistentFactsUsed: 0,
        knowledgeChunksUsed: agentResult.sources.length,
        factsExtracted: 0,
        factsExtractionScheduled: false,
      },
      responseType: agentResult.responseType,
      processingTimeMs: agentResult.processingTimeMs,
      model: agentResult.model,
      usage: agentResult.usage,
      phaseTimings: { agentic: agentResult.processingTimeMs },
      workflow: { executed: [], failed: [], skipped: [], actions: [] },
      actions: {
        executed: visibleActions.executed,
        failed: visibleActions.failed,
        skipped: visibleActions.skipped,
        ctas: visibleActions.ctas,
        leadForms: visibleActions.leadForms,
        channelMessages: visibleActions.channelMessages,
        handoffActivated: handoffRequested,
        forceProductCards: visibleActions.forceProductCards,
        orderLookupForm: policyDecision.action === "allow" && (agentResult.orderLookupForm || visibleActions.orderLookupForm),
        productWidget: visibleActions.productWidget,
        declarativeWidgets,
      },
      quickReplies,
      ctas: visibleActions.ctas,
      productCards: visibleCards,
      productWidget: visibleActions.productWidget,
      declarativeWidgets,
      orderLookupForm: policyDecision.action === "allow" && (agentResult.orderLookupForm || visibleActions.orderLookupForm),
      orderStatusCard: policyDecision.action === "allow" ? agentResult.orderStatusCard : undefined,
    },
  };
}
