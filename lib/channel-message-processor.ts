import "server-only";
import { prisma } from "@/lib/db";
import { orchestrateResponse, type OrchestratorContext } from "@/lib/decision-orchestrator";
import { parseJSON, stringifyJSON } from "@/lib/utils";
import type { ChatbotSettings } from "@/lib/types";
import { enforceOutgoingPolicy, evaluateIncomingPolicy, policyResponse } from "@/lib/agent-policy";

export async function processIncomingChannelMessage(input: { botId: string; channel: "whatsapp" | "instagram"; externalThreadId: string; externalMessageId: string; text: string; analysisText?: string; userName?: string; userPhone?: string }) {
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

  const settings = (parseJSON(conversation.chatbot.settings) || {}) as ChatbotSettings;
  const history = [...conversation.messages].reverse().map(message => ({ role: message.role, content: message.content }));
  const query = input.analysisText?.trim() || input.text;
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
  const incomingPolicy = evaluateIncomingPolicy(query, settings);
  const { runActiveWorkflows } = await import("@/lib/workflow-engine");
  const workflow = await runActiveWorkflows({ botId: input.botId, conversationId: conversation.id, messageId: userMessage.id, message: query, intent: result.decision.intent.intent, sentiment: conversation.sentiment || undefined });
  if (workflow.responseOverride) result.response = workflow.responseOverride;
  const { runTriggeredActions } = await import("@/lib/action-engine");
  await runTriggeredActions({ botId: input.botId, conversationId: conversation.id, messageId: userMessage.id, message: query, intent: result.decision.intent.intent });
  const outgoingPolicy = enforceOutgoingPolicy(result.response, settings);
  const policyDecision = incomingPolicy.action !== "allow" ? incomingPolicy : outgoingPolicy;
  if (policyDecision.action !== "allow") result.response = policyResponse(policyDecision, settings);

  const assistantMessage = await prisma.message.create({
    data: { conversationId: conversation.id, role: "assistant", content: result.response, channel: input.channel, deliveryStatus: "pending", sourcesUsed: stringifyJSON({ sources: result.sourcesUsed, metadata: { intent: result.decision.intent.intent, confidence: result.metadata.confidence, responseType: result.metadata.responseType } }) },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      userIntent: result.decision.intent.intent,
      topicsDiscussed: stringifyJSON(Array.from(new Set([...(parseJSON<string[]>(conversation.topicsDiscussed) || []), ...result.decision.topics]))),
      ...(policyDecision.action === "handoff" ? { needsHumanEscalation: true, escalatedAt: new Date(), escalationReason: `Policy agente: ${policyDecision.matchedRule}` } : {}),
    },
  });
  return { duplicate: false as const, handoff: false as const, handoffActivated: policyDecision.action === "handoff", conversationId: conversation.id, assistantMessageId: assistantMessage.id, response: result.response };
}
