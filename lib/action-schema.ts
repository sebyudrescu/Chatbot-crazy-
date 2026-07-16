import { z } from "zod";
import { safeHttpsUrl } from "./integration-catalog";

export const ActionTypeSchema = z.enum([
  "booking_link",
  "handoff",
  "collect_lead",
  "webhook",
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
    (input.type === "booking_link" || input.type === "webhook") &&
    !safeHttpsUrl(input.config.url || "")
  ) {
    throw new Error("È richiesto un URL HTTPS pubblico valido");
  }
  if (
    input.type === "webhook" &&
    input.config.secret &&
    input.config.secret.length < 16
  ) {
    throw new Error("Il segreto webhook deve contenere almeno 16 caratteri");
  }
}
