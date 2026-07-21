import "server-only";
import { prisma } from "@/lib/db";
import { metaConfiguration, type MetaProvider } from "@/lib/meta-config";
import { metaAccessToken, type MetaConnectionConfig } from "@/lib/meta-connections";
import { buildMetaTextPayload, buildWhatsAppTemplatePayload, type WhatsAppTemplateDefinition } from "@/lib/meta-payloads";

export async function sendMetaText(input: { provider: MetaProvider; config: MetaConnectionConfig; recipientId: string; text: string; messageId: string }) {
  const meta = metaConfiguration();
  const token = metaAccessToken(input.config);
  const assetId = input.provider === "whatsapp" ? input.config.phoneNumberId : input.config.instagramAccountId;
  if (!assetId) throw new Error("Asset Meta mancante");
  const base = input.provider === "instagram" ? meta.instagramGraphBaseUrl : meta.graphBaseUrl;
  const payload = buildMetaTextPayload(input.provider, input.recipientId, input.text);
  const response = await fetch(`${base}/${meta.graphVersion}/${assetId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }>; message_id?: string; error?: { message?: string } };
  if (!response.ok) {
    await prisma.message.update({ where: { id: input.messageId }, data: { deliveryStatus: "failed" } });
    throw new Error(result.error?.message || `Invio Meta fallito (${response.status})`);
  }
  const externalMessageId = result.messages?.[0]?.id || result.message_id;
  await prisma.message.update({ where: { id: input.messageId }, data: { deliveryStatus: "sent", ...(externalMessageId ? { externalMessageId } : {}) } });
}

export async function listWhatsAppTemplates(config: MetaConnectionConfig) {
  if (!config.wabaId) throw new Error("WhatsApp Business Account mancante");
  const meta = metaConfiguration();
  const token = metaAccessToken(config);
  const url = new URL(`${meta.graphBaseUrl}/${meta.graphVersion}/${config.wabaId}/message_templates`);
  url.searchParams.set("fields", "id,name,language,status,category,components");
  url.searchParams.set("limit", "100");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const result = await response.json().catch(() => ({})) as { data?: WhatsAppTemplateDefinition[]; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Lettura template WhatsApp fallita (${response.status})`);
  return (result.data || []).filter(template => template.status === "APPROVED" && ["UTILITY", "AUTHENTICATION"].includes(template.category));
}

export async function sendWhatsAppTemplate(input: { config: MetaConnectionConfig; recipientId: string; name: string; language: string; parameters: string[]; messageId: string }) {
  if (!input.config.phoneNumberId) throw new Error("Numero WhatsApp Business mancante");
  const meta = metaConfiguration();
  const token = metaAccessToken(input.config);
  const response = await fetch(`${meta.graphBaseUrl}/${meta.graphVersion}/${input.config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildWhatsAppTemplatePayload(input)),
  });
  const result = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
  if (!response.ok) {
    await prisma.message.update({ where: { id: input.messageId }, data: { deliveryStatus: "failed" } });
    throw new Error(result.error?.message || `Invio template WhatsApp fallito (${response.status})`);
  }
  const externalMessageId = result.messages?.[0]?.id;
  await prisma.message.update({ where: { id: input.messageId }, data: { deliveryStatus: "sent", ...(externalMessageId ? { externalMessageId } : {}) } });
}
