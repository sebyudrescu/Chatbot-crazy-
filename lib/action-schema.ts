import { z } from "zod";
import { safeHttpsUrl } from "./integration-catalog";
import {
  WidgetDefinitionSchema,
  widgetDefinitionFromConfig,
} from "./widget-definition";

export const ActionTypeSchema = z.enum([
  "booking_link",
  "handoff",
  "collect_lead",
  "webhook",
  "api_request",
  "api_widget",
  "show_widget",
]);

export const WidgetTemplateSchema = z.enum([
  "product_carousel",
  "lead_capture",
  "appointment",
  "order_tracking",
  "custom",
]);

export const ActionFieldsSchema = z.object({
  botId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  type: ActionTypeSchema,
  description: z.string().max(500).nullable().optional(),
  triggerKeywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

export type ActionFields = z.infer<typeof ActionFieldsSchema>;
export type ActionType = z.infer<typeof ActionTypeSchema>;

export function validateActionDefinition(
  input: Pick<ActionFields, "type" | "config">,
) {
  if (
    (input.type === "booking_link" ||
      input.type === "webhook" ||
      input.type === "api_request" ||
      input.type === "api_widget") &&
    !safeHttpsUrl(typeof input.config.url === "string" ? input.config.url : "")
  ) {
    throw new Error("È richiesto un URL HTTPS pubblico valido");
  }
  if (
    (input.type === "api_request" || input.type === "api_widget") &&
    !["GET", "POST", "PUT", "PATCH"].includes(
      (typeof input.config.method === "string" ? input.config.method : "POST").toUpperCase(),
    )
  ) {
    throw new Error("Metodo API non supportato");
  }
  if ((input.type === "api_request" || input.type === "api_widget") && input.config.bodyTemplate) {
    try {
      JSON.parse(String(input.config.bodyTemplate));
    } catch {
      throw new Error("Il template body deve essere JSON valido");
    }
  }
  if (
    input.type === "webhook" &&
    typeof input.config.secret === "string" &&
    input.config.secret.length < 16
  ) {
    throw new Error("Il segreto webhook deve contenere almeno 16 caratteri");
  }
  if (input.type === "show_widget") {
    const template = WidgetTemplateSchema.safeParse(input.config.template);
    if (!template.success) throw new Error("Template widget non supportato");
    if (
      template.data === "appointment" &&
      !safeHttpsUrl(typeof input.config.url === "string" ? input.config.url : "")
    ) {
      throw new Error("Il widget appuntamento richiede un URL HTTPS valido");
    }
    const definition = widgetDefinitionFromConfig(input.config);
    WidgetDefinitionSchema.parse(definition);
  }
  if (input.type === "api_widget") {
    WidgetDefinitionSchema.parse(input.config.definition);
    if (
      input.config.responsePath !== undefined &&
      (typeof input.config.responsePath !== "string" ||
        !/^(?:[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)?$/.test(input.config.responsePath))
    ) {
      throw new Error("Percorso risposta widget non valido");
    }
  }
}
