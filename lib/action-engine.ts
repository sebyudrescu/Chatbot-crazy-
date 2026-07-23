import "server-only";
import { prisma } from "./db";
import { safeHttpsUrl } from "./integration-catalog";
import type { CTA } from "./cta-generator";
import { syncCRMContactFromConversation } from "./crm-sync";
import { deliverWebhook } from "./webhook-delivery";
import { emitIntegrationWebhook } from "./integration-webhooks";
import { decryptConfigSecrets } from "./secret-config";
import { assertSafeRemoteUrl } from "./url-safety";

interface Context {
  botId: string;
  conversationId: string;
  messageId: string;
  message: string;
  intent?: string;
}
export interface ActionResult {
  executed: string[];
  failed: string[];
  skipped: string[];
  ctas: CTA[];
  leadForms: Array<{
    id: string;
    title: string;
    description: string;
    fields: string[];
  }>;
  channelMessages: string[];
  handoffActivated: boolean;
}
const parse = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const isUniqueConflict = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "P2002";

export async function runTriggeredActions(
  context: Context,
): Promise<ActionResult> {
  const actions = await prisma.agentAction.findMany({
    where: { botId: context.botId, enabled: true },
  });
  const result: ActionResult = {
      executed: [],
      failed: [],
      skipped: [],
      ctas: [],
      leadForms: [],
      channelMessages: [],
      handoffActivated: false,
    },
    normalized = context.message.toLocaleLowerCase("it");
  for (const action of actions) {
    const keywords = parse<string[]>(action.triggerKeywords, []);
    if (
      !keywords.length ||
      !keywords.some((keyword) =>
        normalized.includes(keyword.toLocaleLowerCase("it")),
      )
    )
      continue;
    const config = decryptConfigSecrets(parse<Record<string, string>>(action.config, {})),
      started = Date.now();
    const idempotencyKey = `${action.id}:${context.messageId}`;
    let executionId = "";
    const existingExecution = await prisma.actionExecution.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existingExecution) {
      result.skipped.push(action.id);
      continue;
    }
    try {
      const execution = await prisma.actionExecution.create({
        data: {
          actionId: action.id,
          conversationId: context.conversationId,
          idempotencyKey,
          success: false,
          input: JSON.stringify({
            message: context.message,
            intent: context.intent,
          }),
        },
      });
      executionId = execution.id;
    } catch (error) {
      if (isUniqueConflict(error)) {
        result.skipped.push(action.id);
        continue;
      }
      throw error;
    }
    let success = false,
      output = "",
      error = "";
    try {
      if (action.type === "booking_link") {
        const url = safeHttpsUrl(config.url);
        if (!url) throw new Error("Link prenotazione non valido");
        result.ctas.push({
          id: `action-${action.id}`,
          type: "link",
          label: config.label || "Prenota appuntamento",
          action: url.toString(),
          variant: "primary",
        });
        result.channelMessages.push(`${config.label || "Prenota appuntamento"}: ${url.toString()}`);
        output = "CTA prenotazione mostrata";
        success = true;
      } else if (action.type === "handoff") {
        await prisma.conversation.update({
          where: { id: context.conversationId },
          data: {
            needsHumanEscalation: true,
            escalatedAt: new Date(),
            escalationReason: config.reason || "Azione automatica",
          },
        });
        await emitIntegrationWebhook({
          botId: context.botId,
          event: "conversation.handoff_requested",
          idempotencyKey: `handoff-action:${action.id}:${context.messageId}`,
          payload: {
            conversationId: context.conversationId,
            messageId: context.messageId,
            reason: config.reason || "Azione automatica",
            intent: context.intent || null,
          },
        });
        output = "Conversazione passata a operatore";
        result.handoffActivated = true;
        if (config.message?.trim()) result.channelMessages.push(config.message.trim());
        success = true;
      } else if (action.type === "collect_lead") {
        const email = context.message.match(
            /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
          )?.[0],
          phone = context.message.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0];
        if (!email && !phone) {
          result.leadForms.push({
            id: `lead-${action.id}`,
            title: config.title || "Lascia i tuoi contatti",
            description:
              config.description ||
              "Ti ricontatteremo per aiutarti con la tua richiesta.",
            fields: ["name", "email", "phone", "company"],
          });
          result.channelMessages.push([
            config.title || "Lascia i tuoi contatti",
            config.description || "Ti ricontatteremo per aiutarti con la tua richiesta.",
            "Indicami il tuo nome e almeno un indirizzo email o un numero di telefono.",
          ].join("\n"));
          output = "Modulo contatto mostrato";
        } else {
          await prisma.conversation.update({
            where: { id: context.conversationId },
            data: {
              ...(email ? { userEmail: email } : {}),
              ...(phone ? { userPhone: phone.trim() } : {}),
            },
          });
          await syncCRMContactFromConversation(context.conversationId);
          await emitIntegrationWebhook({
            botId: context.botId,
            event: "lead.captured",
            idempotencyKey: `lead-action:${action.id}:${context.messageId}`,
            payload: {
              conversationId: context.conversationId,
              messageId: context.messageId,
              email: email || null,
              phone: phone?.trim() || null,
            },
          });
          output = email ? "Email raccolta" : "Telefono raccolto";
        }
        success = true;
      } else if (action.type === "webhook") {
        const url = safeHttpsUrl(config.url);
        if (!url) throw new Error("Endpoint webhook non valido");
        const delivery = await deliverWebhook({
          url: url.toString(),
          event: config.event || "action.triggered",
          payload: {
            botId: context.botId,
            conversationId: context.conversationId,
            messageId: context.messageId,
            message: context.message,
            intent: context.intent || null,
          },
          secret: config.secret || undefined,
          idempotencyKey,
        });
        if (!delivery.success) throw new Error(delivery.error);
        output = `Webhook HTTP ${delivery.status} · ${delivery.attempts} tentativi`;
        success = true;
      } else if (action.type === "api_request") {
        const url = safeHttpsUrl(config.url);
        if (!url) throw new Error("Endpoint API non valido");
        await assertSafeRemoteUrl(url.toString());
        const method = (config.method || "POST").toUpperCase();
        if (!["GET", "POST", "PUT", "PATCH"].includes(method)) {
          throw new Error("Metodo API non supportato");
        }
        const variables: Record<string, string> = {
          "{{message}}": context.message,
          "{{intent}}": context.intent || "",
          "{{conversationId}}": context.conversationId,
          "{{botId}}": context.botId,
        };
        const renderTemplate = (value: unknown): unknown => {
          if (Array.isArray(value)) return value.map(renderTemplate);
          if (value && typeof value === "object") {
            return Object.fromEntries(
              Object.entries(value as Record<string, unknown>)
                .map(([key, item]) => [key, renderTemplate(item)]),
            );
          }
          if (typeof value !== "string") return value;
          return Object.entries(variables).reduce(
            (rendered, [placeholder, replacement]) =>
              rendered.replaceAll(placeholder, replacement),
            value,
          );
        };
        const template = config.bodyTemplate || JSON.stringify({
          message: "{{message}}",
          intent: "{{intent}}",
          conversationId: "{{conversationId}}",
          botId: "{{botId}}",
        });
        const body = method === "GET"
          ? undefined
          : JSON.stringify(renderTemplate(JSON.parse(template)));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        try {
          const response = await fetch(url, {
            method,
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "LitX-Action/1.0",
              "Idempotency-Key": idempotencyKey,
              ...(config.authorization ? { Authorization: config.authorization } : {}),
            },
            body,
            redirect: "manual",
            signal: controller.signal,
          });
          await response.body?.cancel();
          if (!response.ok) throw new Error(`API HTTP ${response.status}`);
          output = config.resultMessage || `API HTTP ${response.status}`;
          success = true;
        } finally {
          clearTimeout(timer);
        }
      } else throw new Error("Tipo azione non supportato");
    } catch (caught) {
      error =
        caught instanceof Error ? caught.message : "Esecuzione non riuscita";
    }
    await prisma.actionExecution.update({
      where: { id: executionId },
      data: {
        success,
        status: success ? "success" : "failed",
        output: output || null,
        error: error || null,
        durationMs: Date.now() - started,
      },
    });
    if (success) result.executed.push(action.id);
    else result.failed.push(action.id);
  }
  return result;
}
