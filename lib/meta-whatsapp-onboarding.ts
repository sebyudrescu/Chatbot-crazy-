import "server-only";
import { prisma } from "@/lib/db";
import { metaConfiguration, metaReadiness } from "@/lib/meta-config";
import { saveMetaConnection } from "@/lib/meta-connections";
import { assertMetaClientLinkUnused } from "@/lib/meta-client-link-usage";

export interface CompleteWhatsAppConnectionInput {
  botId: string;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string;
  clientLinkIssuedAt?: number;
}

export async function completeWhatsAppConnection(input: CompleteWhatsAppConnectionInput) {
  if (!metaReadiness("whatsapp")) throw new Error("Completa prima la configurazione Meta nelle variabili server.");
  const bot = await prisma.chatbot.findUnique({ where: { id: input.botId }, select: { id: true } });
  if (!bot) throw new Error("Agente non trovato");

  const meta = metaConfiguration();
  const tokenUrl = new URL(`${meta.graphBaseUrl}/${meta.graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", meta.appId);
  tokenUrl.searchParams.set("client_secret", meta.appSecret);
  tokenUrl.searchParams.set("code", input.code);
  const tokenResponse = await fetch(tokenUrl, { headers: { Accept: "application/json" } });
  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error?.message || "Meta non ha restituito un token valido");
  }

  const phoneListUrl = new URL(`${meta.graphBaseUrl}/${meta.graphVersion}/${input.wabaId}/phone_numbers`);
  phoneListUrl.searchParams.set("fields", "id,display_phone_number");
  phoneListUrl.searchParams.set("limit", "100");
  const phoneResponse = await fetch(phoneListUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
  });
  const phones = (await phoneResponse.json().catch(() => ({}))) as {
    data?: Array<{ id?: string; display_phone_number?: string }>;
    error?: { message?: string };
  };
  if (!phoneResponse.ok) {
    throw new Error(phones.error?.message || "Impossibile verificare i numeri del WhatsApp Business Account");
  }
  const selectedPhone = phones.data?.find((phone) => phone.id === input.phoneNumberId);
  if (!selectedPhone) {
    throw new Error("Il numero selezionato non appartiene al WhatsApp Business Account autorizzato");
  }

  const subscription = await fetch(
    `${meta.graphBaseUrl}/${meta.graphVersion}/${input.wabaId}/subscribed_apps`,
    { method: "POST", headers: { Authorization: `Bearer ${tokenData.access_token}` } },
  );
  if (!subscription.ok) {
    const detail = (await subscription.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(detail.error?.message || "Impossibile iscrivere il webhook al WhatsApp Business Account");
  }

  if (input.clientLinkIssuedAt) {
    await assertMetaClientLinkUnused({
      botId: input.botId,
      provider: "whatsapp",
      issuedAt: input.clientLinkIssuedAt,
    });
  }
  await saveMetaConnection({
    botId: input.botId,
    provider: "whatsapp",
    accessToken: tokenData.access_token,
    details: {
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      businessId: input.businessId,
      displayPhoneNumber: selectedPhone.display_phone_number,
      tokenExpiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : undefined,
    },
  });
  return { displayPhoneNumber: selectedPhone.display_phone_number || null };
}
