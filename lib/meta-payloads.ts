export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

const DELIVERY_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export function normalizeMetaDeliveryStatus(value: string) {
  const status = value.toLowerCase();
  return status in DELIVERY_RANK ? status : null;
}

export function shouldAdvanceDeliveryStatus(current: string | null | undefined, next: string) {
  const normalized = normalizeMetaDeliveryStatus(next);
  if (!normalized) return false;
  if (!current || !(current in DELIVERY_RANK)) return true;
  if (current === "failed" || current === "read") return false;
  return DELIVERY_RANK[normalized] >= DELIVERY_RANK[current];
}

export interface WhatsAppTemplateComponent {
  type: string;
  text?: string;
}

export interface WhatsAppTemplateDefinition {
  id?: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: WhatsAppTemplateComponent[];
}

export function whatsappServiceWindow(lastInboundAt: Date | string | null | undefined, now = new Date()) {
  if (!lastInboundAt) return { open: false, closesAt: null as string | null };
  const timestamp = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(timestamp)) return { open: false, closesAt: null as string | null };
  const closesAt = new Date(timestamp + WHATSAPP_SERVICE_WINDOW_MS);
  return { open: now.getTime() < closesAt.getTime(), closesAt: closesAt.toISOString() };
}

export function templateBody(template: WhatsAppTemplateDefinition) {
  return template.components.find(component => component.type.toUpperCase() === "BODY")?.text || template.name;
}

export function templateParameterCount(template: WhatsAppTemplateDefinition) {
  const matches = [...templateBody(template).matchAll(/\{\{(\d+)\}\}/g)].map(match => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
}

export function templateHasUnsupportedVariables(template: WhatsAppTemplateDefinition) {
  return template.components.some(component => component.type.toUpperCase() !== "BODY" && /\{\{\d+\}\}/.test(component.text || ""));
}

export function renderWhatsAppTemplate(template: WhatsAppTemplateDefinition, parameters: string[]) {
  return templateBody(template).replace(/\{\{(\d+)\}\}/g, (_, index: string) => parameters[Number(index) - 1] || `{{${index}}}`);
}

export function buildMetaTextPayload(provider: "whatsapp" | "instagram", recipientId: string, text: string) {
  return provider === "whatsapp"
    ? { messaging_product: "whatsapp", recipient_type: "individual", to: recipientId, type: "text", text: { preview_url: false, body: text } }
    : { recipient: { id: recipientId }, message: { text } };
}

export function buildWhatsAppTemplatePayload(input: { recipientId: string; name: string; language: string; parameters: string[] }) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.recipientId,
    type: "template",
    template: {
      name: input.name,
      language: { code: input.language },
      ...(input.parameters.length ? { components: [{ type: "body", parameters: input.parameters.map(text => ({ type: "text", text })) }] } : {}),
    },
  };
}
