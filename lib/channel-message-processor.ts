import "server-only";
import { prisma } from "@/lib/db";
import { orchestrateResponse, type OrchestratorContext } from "@/lib/decision-orchestrator";
import { parseJSON, stringifyJSON } from "@/lib/utils";
import type { ChatbotSettings } from "@/lib/types";
import { enforceOutgoingPolicy, evaluateIncomingPolicy, policyResponse } from "@/lib/agent-policy";
import { checkRateLimit } from "@/lib/rate-limit";
import { detectSentiment } from "@/lib/sentiment";

const CHANNEL_RATE_LIMIT = 30;
const CHANNEL_RATE_WINDOW_MS = 5 * 60_000;
const CHANNEL_RATE_LIMIT_MESSAGE = "Ho ricevuto molti messaggi in poco tempo. Attendi qualche minuto prima di continuare, così potrò aiutarti correttamente.";

export async function processIncomingChannelMessage(input: { botId: string; channel: "whatsapp" | "instagram"; externalThreadId: string; externalMessageId: string; text: string; analysisText?: string; automationText?: string; userName?: string; userPhone?: string }) {
  const duplicate = await prisma.message.findUnique({ where: { externalMessageId: input.externalMessageId }, select: { id: true } });
  if (duplicate) return { duplicate: true as const };

  const conversation = await prisma.conversation.upsert({
    where: { botId_channel_externalThreadId: { botId: input.botId, channel: input.channel, externalThreadId: input.externalThreadId } },
    create: { botId: input.botId, userSessionId: `${input.channel}:${input.externalThreadId}`, channel: input.channel, externalThreadId: input.externalThreadId, userName: input.userName, userPhone: input.userPhone },
    update: { lastMessageAt: new Date(), ...(input.userName ? { userName: input.userName } : {}), ...(input.userPhone ? { userPhone: input.userPhone } : {}) },
    include: { chatbot: true, messages: { orderBy: { createdAt: "desc" }, take: 12 } },
  });

  const userMessage = await prisma.message.create({ data: { conversationId: conversation.id, role: "user", content: input.text, channel: input.channel, externalMessageId: input.externalMessageId, deliveryStatus: "received" } });
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
        ...(incomingPolicy.action === "handoff" ? {
          needsHumanEscalation: true,
          escalatedAt: new Date(),
          escalationReason: `Policy agente: ${incomingPolicy.matchedRule}`,
        } : {}),
      },
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
  const context: OrchestratorContext = {
    botId: input.botId,
    conversationId: conversation.id,
    query,
    conversationHistory: history,
    conversationMetadata: { userIntent: conversation.userIntent || undefined, sentiment: conversation.sentiment || undefined, topics: parseJSON<string[]>(conversation.topicsDiscussed) || undefined },
    botConfig: {
      companyName: conversation.chatbot.companyName,
      promptTemplateId: conversation.chatbot.promptTemplateId,
      systemPrompt: conversation.chatbot.systemPrompt,
      promptVariables: parseJSON(conversation.chatbot.promptVariables),
      role: settings.role, objective: settings.objective, personality: settings.personality, rules: settings.rules,
      forbiddenTopics: settings.forbiddenTopics, forbiddenResponses: settings.forbiddenResponses,
      handoffTriggers: settings.handoffTriggers, leadCollectionFields: settings.leadCollectionFields, language: settings.language,
      tone: settings.tone, responseLength: settings.responseLength, fallbackMessage: settings.fallbackMessage, handoffMessage: settings.handoffMessage,
      aiModel: settings.aiModel, temperature: settings.temperature, maxTokens: settings.maxTokens,
    },
  };
  const result = await orchestrateResponse(context);
  const currentSentiment = detectSentiment(automationMessage);
  const workflow = await import("@/lib/workflow-engine").then(({ runActiveWorkflows }) => runActiveWorkflows({ botId: input.botId, conversationId: conversation.id, messageId: userMessage.id, message: automationMessage, intent: result.decision.intent.intent, sentiment: currentSentiment }));
  if (workflow.responseOverride) result.response = workflow.responseOverride;
  const actionResult = await import("@/lib/action-engine").then(({ runTriggeredActions }) => runTriggeredActions({ botId: input.botId, conversationId: conversation.id, messageId: userMessage.id, message: automationMessage, intent: result.decision.intent.intent }));
  const channelActionText = actionResult.channelMessages.filter((message) => message.trim()).join("\n\n");
  if (channelActionText && !result.response.includes(channelActionText)) {
    result.response = [result.response.trim(), channelActionText].filter(Boolean).join("\n\n");
  }
  const outgoingPolicy = enforceOutgoingPolicy(result.response, settings);
  const policyDecision = outgoingPolicy;
  if (policyDecision.action !== "allow") result.response = policyResponse(policyDecision, settings);

  const assistantMessage = await prisma.message.create({
    data: { conversationId: conversation.id, role: "assistant", content: result.response, channel: input.channel, deliveryStatus: "pending", sourcesUsed: stringifyJSON({ sources: result.sourcesUsed, metadata: { intent: result.decision.intent.intent, confidence: result.metadata.confidence, responseType: result.metadata.responseType, workflowsExecuted: workflow.executed, workflowActions: workflow.actions, actionsExecuted: actionResult.executed, actionsFailed: actionResult.failed } }) },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      userIntent: result.decision.intent.intent,
      sentiment: currentSentiment,
      topicsDiscussed: stringifyJSON(Array.from(new Set([...(parseJSON<string[]>(conversation.topicsDiscussed) || []), ...result.decision.topics]))),
      ...(policyDecision.action === "handoff" ? { needsHumanEscalation: true, escalatedAt: new Date(), escalationReason: `Policy agente: ${policyDecision.matchedRule}` } : {}),
    },
  });
  return { duplicate: false as const, handoff: false as const, handoffActivated: policyDecision.action === "handoff" || actionResult.handoffActivated || workflow.actions.includes("handoff"), conversationId: conversation.id, assistantMessageId: assistantMessage.id, response: result.response };
}
