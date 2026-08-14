import "server-only";
import { prisma } from "./db";
import { safeHttpsUrl } from "./integration-catalog";
import type { CTA } from "./cta-generator";
import { syncCRMContactFromConversation } from "./crm-sync";
import { deliverWebhook } from "./webhook-delivery";
import { emitIntegrationWebhook } from "./integration-webhooks";
import { decryptConfigSecrets } from "./secret-config";
import { assertSafeRemoteUrl } from "./url-safety";
import { checkRateLimit } from "./rate-limit";
import {
  publicWidgetDefinition,
  validateWidgetData,
  validateWidgetInitialData,
  WidgetDefinitionSchema,
} from "./widget-definition";

interface Context {
  botId: string;
  conversationId: string;
  messageId: string;
  message: string;
  intent?: string;
  selectedActionIds?: string[];
  triggerMode?: "semantic" | "keyword_fallback";
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
    submitLabel?: string;
  }>;
  channelMessages: string[];
  handoffActivated: boolean;
  forceProductCards: boolean;
  orderLookupForm: boolean;
  productWidget: { title: string; description: string; label: string } | null;
  declarativeWidgets: Array<{
    id: string;
    actionId: string;
    definition: ReturnType<typeof publicWidgetDefinition>;
    data: Record<string, unknown>;
  }>;
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
  const previousAssistant = actions.some(
    (action) => action.type === "collect_lead",
  )
    ? await prisma.message.findFirst({
        where: { conversationId: context.conversationId, role: "assistant" },
        orderBy: { createdAt: "desc" },
        select: { content: true },
      })
    : null;
  const pendingLeadConsent =
    /acconsent[io].*ricontatt|se acconsenti.*(?:email|telefono)|indicami.*(?:email|telefono)/i.test(
      previousAssistant?.content || "",
    );
  const result: ActionResult = {
      executed: [],
      failed: [],
      skipped: [],
      ctas: [],
      leadForms: [],
      channelMessages: [],
      handoffActivated: false,
      forceProductCards: false,
      orderLookupForm: false,
      productWidget: null,
      declarativeWidgets: [],
    },
    normalized = context.message.toLocaleLowerCase("it");
  const selectedActionIds = new Set(context.selectedActionIds || []);
  const semanticTypes = new Set([
    "show_widget",
    "booking_link",
    "collect_lead",
    "handoff",
    "api_widget",
  ]);
  for (const action of actions) {
    const keywords = parse<string[]>(action.triggerKeywords, []);
    const keywordTriggered = keywords.some((keyword) =>
      normalized.includes(keyword.toLocaleLowerCase("it")),
    );
    const pendingLeadReply =
      action.type === "collect_lead" &&
      pendingLeadConsent &&
      /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d\s().-]{7,}\d)/.test(
        context.message,
      );
    const semanticTriggered =
      context.triggerMode === "semantic" &&
      selectedActionIds.has(action.id) &&
      semanticTypes.has(action.type) &&
      (action.type !== "api_widget" ||
        String(decryptConfigSecrets(parse<Record<string, string>>(action.config, {})).method || "POST").toUpperCase() === "GET");
    if (context.triggerMode === "semantic") {
      if (!semanticTriggered) continue;
    } else if (!keywords.length || (!keywordTriggered && !pendingLeadReply)) {
      continue;
    }
    const config = decryptConfigSecrets(
        parse<Record<string, string>>(action.config, {}),
      ),
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
        result.channelMessages.push(
          `${config.label || "Prenota appuntamento"}: ${url.toString()}`,
        );
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
        if (config.message?.trim())
          result.channelMessages.push(config.message.trim());
        success = true;
      } else if (action.type === "collect_lead") {
        const mayStoreContact =
            context.triggerMode !== "semantic" ||
            pendingLeadConsent ||
            /acconsent|autorizz.{0,30}ricontatt|contattatemi/i.test(context.message),
          email = mayStoreContact ? context.message.match(
            /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
          )?.[0] : undefined,
          phone = mayStoreContact
            ? context.message.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]
            : undefined;
        if (!email && !phone) {
          result.leadForms.push({
            id: `lead-${action.id}`,
            title: config.title || "Lascia i tuoi contatti",
            description:
              config.description ||
              "Ti ricontatteremo per aiutarti con la tua richiesta.",
            fields: ["name", "email", "phone", "company"],
          });
          result.channelMessages.push(
            [
              config.title || "Lascia i tuoi contatti",
              config.description ||
                "Ti ricontatteremo per aiutarti con la tua richiesta.",
              "Se acconsenti a essere ricontattato per questa richiesta, indicami il tuo nome e almeno un indirizzo email o un numero di telefono.",
            ].join("\n"),
          );
          output = "Modulo contatto mostrato";
        } else {
          await prisma.conversation.update({
            where: { id: context.conversationId },
            data: {
              ...(email ? { userEmail: email } : {}),
              ...(phone ? { userPhone: phone.trim() } : {}),
            },
          });
          await syncCRMContactFromConversation(context.conversationId, {
            consentStatus: "granted",
          });
          await emitIntegrationWebhook({
            botId: context.botId,
            event: "lead.captured",
            idempotencyKey: `lead-action:${action.id}:${context.messageId}`,
            payload: {
              conversationId: context.conversationId,
              messageId: context.messageId,
              email: email || null,
              phone: phone?.trim() || null,
              consent: true,
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
      } else if (action.type === "api_request" || action.type === "api_widget") {
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
              Object.entries(value as Record<string, unknown>).map(
                ([key, item]) => [key, renderTemplate(item)],
              ),
            );
          }
          if (typeof value !== "string") return value;
          return Object.entries(variables).reduce(
            (rendered, [placeholder, replacement]) =>
              rendered.replaceAll(placeholder, replacement),
            value,
          );
        };
        const template =
          config.bodyTemplate ||
          JSON.stringify({
            message: "{{message}}",
            intent: "{{intent}}",
            conversationId: "{{conversationId}}",
            botId: "{{botId}}",
          });
        const body =
          method === "GET"
            ? undefined
            : JSON.stringify(renderTemplate(JSON.parse(template)));
        if (action.type === "api_widget") {
          const rate = await checkRateLimit(
            `api-widget:${action.id}:${context.conversationId}`,
            10,
            60_000,
          );
          if (!rate.allowed) throw new Error("Limite API widget raggiunto");
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        try {
          const response = await fetch(url, {
            method,
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "LitX-Action/1.0",
              "Idempotency-Key": idempotencyKey,
              ...(config.authorization
                ? { Authorization: config.authorization }
                : {}),
            },
            body,
            redirect: "manual",
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`API HTTP ${response.status}`);
          if (action.type === "api_widget") {
            const declaredLength = Number(response.headers.get("content-length") || 0);
            if (declaredLength > 1_000_000) throw new Error("Risposta API widget troppo grande");
            const reader = response.body?.getReader();
            const chunks: Uint8Array[] = [];
            let total = 0;
            if (reader) {
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                total += chunk.value.byteLength;
                if (total > 1_000_000) {
                  await reader.cancel();
                  throw new Error("Risposta API widget troppo grande");
                }
                chunks.push(chunk.value);
              }
            }
            const bytes = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.byteLength;
            }
            const payload = JSON.parse(new TextDecoder().decode(bytes));
            const responsePath = typeof config.responsePath === "string" ? config.responsePath : "";
            const selected = responsePath
              ? responsePath.split(".").reduce<unknown>((current, part) =>
                  current && typeof current === "object"
                    ? (current as Record<string, unknown>)[part]
                    : undefined, payload)
              : payload;
            const definition = WidgetDefinitionSchema.parse(config.definition);
            const data = validateWidgetData(definition, selected);
            result.declarativeWidgets.push({
              id: `widget-${action.id}-${context.messageId}`,
              actionId: action.id,
              definition: publicWidgetDefinition(definition),
              data,
            });
            output = `API widget HTTP ${response.status}`;
          } else {
            await response.body?.cancel();
            output = config.resultMessage || `API HTTP ${response.status}`;
          }
          success = true;
        } finally {
          clearTimeout(timer);
        }
      } else if (action.type === "show_widget") {
        const template = config.template;
        if (template === "product_carousel") {
          result.forceProductCards = true;
          result.productWidget = {
            title: config.title || "Scelti per te",
            description:
              config.description ||
              "Sfoglia i prodotti verificati e scegli quello che preferisci.",
            label: config.label || "Aggiungi al carrello",
          };
          output = "Widget prodotti richiesto";
        } else if (template === "lead_capture") {
          result.leadForms.push({
            id: `widget-${action.id}`,
            title: config.title || "Lascia i tuoi contatti",
            description:
              config.description ||
              "Ti ricontatteremo per aiutarti con la tua richiesta.",
            fields: ["name", "email", "phone", "company"],
            submitLabel: config.label || "Invia richiesta",
          });
          result.channelMessages.push(
            [
              config.title || "Lascia i tuoi contatti",
              config.description ||
                "Ti ricontatteremo per aiutarti con la tua richiesta.",
              "Se acconsenti, indicami nome e almeno un indirizzo email o un numero di telefono.",
            ].join("\n"),
          );
          output = "Widget contatto mostrato";
        } else if (template === "appointment") {
          const url = safeHttpsUrl(config.url);
          if (!url) throw new Error("Link appuntamento non valido");
          const label = config.label || "Prenota appuntamento";
          result.ctas.push({
            id: `widget-${action.id}`,
            type: "link",
            label,
            action: url.toString(),
            variant: "primary",
            metadata: {
              title: config.title || "Prenota un appuntamento",
              description:
                config.description ||
                "Scegli il momento più comodo dal calendario.",
            },
          });
          result.channelMessages.push(`${label}: ${url.toString()}`);
          output = "Widget appuntamento mostrato";
        } else if (template === "order_tracking") {
          result.orderLookupForm = true;
          result.channelMessages.push(
            "Per controllare l’ordine, indicami numero ordine ed email usata durante l’acquisto.",
          );
          output = "Widget tracking ordine mostrato";
        } else if (template === "custom") {
          const definition = WidgetDefinitionSchema.parse(config.definition);
          result.declarativeWidgets.push({
            id: `widget-${action.id}-${context.messageId}`,
            actionId: action.id,
            definition: publicWidgetDefinition(definition),
            data: validateWidgetInitialData(
              definition,
              definition.defaults,
            ),
          });
          output = "Widget dichiarativo mostrato";
        } else {
          throw new Error("Template widget non supportato");
        }
        success = true;
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
