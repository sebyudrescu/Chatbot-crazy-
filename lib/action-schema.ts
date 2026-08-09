import { z } from "zod";
import { safeHttpsUrl } from "./integration-catalog";

export const ActionTypeSchema = z.enum([
  "booking_link",
  "handoff",
  "collect_lead",
  "webhook",
  "api_request",
  "show_widget",
]);

export const WidgetTemplateSchema = z.enum([
  "product_carousel",
  "lead_capture",
  "appointment",
  "order_tracking",
]);

export const ActionFieldsSchema = z.object({
  botId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  type: ActionTypeSchema,
  description: z.string().max(500).nullable().optional(),
  triggerKeywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  config: z.record(z.string()).default({}),
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
      input.type === "api_request") &&
    !safeHttpsUrl(input.config.url || "")
  ) {
    throw new Error("È richiesto un URL HTTPS pubblico valido");
  }
  if (
    input.type === "api_request" &&
    !["GET", "POST", "PUT", "PATCH"].includes(
      (input.config.method || "POST").toUpperCase(),
    )
  ) {
    throw new Error("Metodo API non supportato");
  }
  if (input.type === "api_request" && input.config.bodyTemplate) {
    try {
      JSON.parse(input.config.bodyTemplate);
    } catch {
      throw new Error("Il template body deve essere JSON valido");
    }
  }
  if (
    input.type === "webhook" &&
    input.config.secret &&
    input.config.secret.length < 16
  ) {
    throw new Error("Il segreto webhook deve contenere almeno 16 caratteri");
  }
  if (input.type === "show_widget") {
    const template = WidgetTemplateSchema.safeParse(input.config.template);
    if (!template.success) throw new Error("Template widget non supportato");
    if (
      template.data === "appointment" &&
      !safeHttpsUrl(input.config.url || "")
    ) {
      throw new Error("Il widget appuntamento richiede un URL HTTPS valido");
    }
  }
}
