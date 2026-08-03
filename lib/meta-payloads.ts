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

export function whatsappIncomingText(message: {
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string; description?: string } };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string }> }>;
  order?: { catalog_id?: string; product_items?: Array<{ product_retailer_id?: string; quantity?: number }> };
}) {
  const text = message.text?.body?.trim();
  if (text) return text;
  const button = message.button;
  if (button?.text || button?.payload) return [button.text, button.payload ? `(scelta: ${button.payload})` : ""].filter(Boolean).join(" ");
  const reply = message.interactive?.button_reply || message.interactive?.list_reply;
  if (reply?.title || reply?.id) return [reply.title, reply.id ? `(scelta: ${reply.id})` : ""].filter(Boolean).join(" ");
  if (message.location && Number.isFinite(message.location.latitude) && Number.isFinite(message.location.longitude)) {
    return [`Posizione condivisa: ${message.location.name || ""}`.trim(), message.location.address, `${message.location.latitude}, ${message.location.longitude}`].filter(Boolean).join(" · ");
  }
  if (message.contacts?.length) {
    const contacts = message.contacts.slice(0, 3).map(contact => [contact.name?.formatted_name, contact.phones?.[0]?.phone].filter(Boolean).join(" · ")).filter(Boolean);
    return contacts.length ? `Contatti condivisi: ${contacts.join("; ")}` : "Contatto condiviso";
  }
  if (message.order?.product_items?.length) {
    const items = message.order.product_items.slice(0, 10).map(item => `${item.product_retailer_id || "prodotto"} × ${item.quantity || 1}`);
    return `Ordine condiviso: ${items.join(", ")}`;
  }
  return "";
}

export function instagramIncomingText(event: {
  message?: { text?: string };
  postback?: { title?: string; payload?: string };
}) {
  const text = event.message?.text?.trim();
  if (text) return text;
  if (event.postback?.title || event.postback?.payload) {
    return [event.postback.title, event.postback.payload ? `(scelta: ${event.postback.payload})` : ""].filter(Boolean).join(" ");
  }
  return "";
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

type MetaProductCard = {
  title: string;
  shortDescription: string;
  imageUrl?: string;
  productUrl: string;
  price?: number;
  currency?: string;
  availability: "in_stock" | "out_of_stock" | "preorder" | "unknown";
};

function cardPrice(card: MetaProductCard) {
  if (card.price === undefined || !card.currency) return "";
  try { return new Intl.NumberFormat("it-IT", { style: "currency", currency: card.currency }).format(card.price); }
  catch { return `${card.price.toFixed(2)} ${card.currency}`; }
}

function productSubtitle(card: MetaProductCard) {
  return [
    cardPrice(card),
    card.availability === "in_stock" ? "Disponibile" : card.availability === "out_of_stock" ? "Non disponibile" : undefined,
    card.shortDescription.replace(/\s+/g, " ").trim().slice(0, 160),
  ].filter(Boolean).join(" · ").slice(0, 300);
}

export function buildMetaProductPayloads(provider: "whatsapp" | "instagram", recipientId: string, cards: MetaProductCard[]) {
  const safeCards = cards.slice(0, 5);
  if (provider === "instagram") {
    if (!safeCards.length) return [];
    return [{
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: safeCards.map(card => ({
              title: card.title.slice(0, 80),
              ...(card.imageUrl ? { image_url: card.imageUrl } : {}),
              subtitle: productSubtitle(card),
              default_action: { type: "web_url", url: card.productUrl },
              buttons: [{ type: "web_url", url: card.productUrl, title: "Vedi prodotto" }],
            })),
          },
        },
      },
    }];
  }
  return safeCards.map(card => {
    const caption = [card.title, productSubtitle(card), `Vedi prodotto: ${card.productUrl}`].filter(Boolean).join("\n").slice(0, 1024);
    return card.imageUrl
      ? { messaging_product: "whatsapp", recipient_type: "individual", to: recipientId, type: "image", image: { link: card.imageUrl, caption } }
      : { messaging_product: "whatsapp", recipient_type: "individual", to: recipientId, type: "text", text: { preview_url: true, body: caption } };
  });
}
