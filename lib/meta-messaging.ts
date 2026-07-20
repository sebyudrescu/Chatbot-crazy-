import "server-only";
import { prisma } from "@/lib/db";
import { metaConfiguration, type MetaProvider } from "@/lib/meta-config";
import { metaAccessToken, type MetaConnectionConfig } from "@/lib/meta-connections";

export async function sendMetaText(input: { provider: MetaProvider; config: MetaConnectionConfig; recipientId: string; text: string; messageId: string }) {
  const meta = metaConfiguration();
  const token = metaAccessToken(input.config);
  const assetId = input.provider === "whatsapp" ? input.config.phoneNumberId : input.config.instagramAccountId;
  if (!assetId) throw new Error("Asset Meta mancante");
  const base = input.provider === "instagram" ? meta.instagramGraphBaseUrl : meta.graphBaseUrl;
  const payload = input.provider === "whatsapp"
    ? { messaging_product: "whatsapp", recipient_type: "individual", to: input.recipientId, type: "text", text: { preview_url: false, body: input.text } }
    : { recipient: { id: input.recipientId }, message: { text: input.text } };
  const response = await fetch(`${base}/${meta.graphVersion}/${assetId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) {
    await prisma.message.update({ where: { id: input.messageId }, data: { deliveryStatus: "failed" } });
    throw new Error(result.error?.message || `Invio Meta fallito (${response.status})`);
  }
  await prisma.message.update({ where: { id: input.messageId }, data: { deliveryStatus: "sent" } });
}
