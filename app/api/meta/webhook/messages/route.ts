import { after, type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { metaConfiguration } from "@/lib/meta-config";
import { findMetaConnection, parseMetaConnection } from "@/lib/meta-connections";
import { verifyMetaSignature } from "@/lib/meta-security";
import { processIncomingChannelMessage } from "@/lib/channel-message-processor";
import { sendMetaText } from "@/lib/meta-messaging";

type WhatsAppMessage = { id?: string; from?: string; type?: string; text?: { body?: string } };
type WhatsAppValue = { metadata?: { phone_number_id?: string }; contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>; messages?: WhatsAppMessage[] };
type InstagramEvent = { sender?: { id?: string }; recipient?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean } };
type MetaPayload = { object?: string; entry?: Array<{ id?: string; changes?: Array<{ value?: WhatsAppValue }>; messaging?: InstagramEvent[] }> };

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && challenge && token === metaConfiguration().verifyToken) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ error: "Verifica webhook non valida" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Firma webhook non valida" }, { status: 401 });
  let payload: MetaPayload;
  try { payload = JSON.parse(rawBody) as MetaPayload; } catch { return NextResponse.json({ error: "Payload non valido" }, { status: 400 }); }
  after(async () => {
    if (payload.object === "whatsapp_business_account") await handleWhatsApp(payload);
    else await handleInstagram(payload);
  });
  return NextResponse.json({ received: true });
}

async function handleWhatsApp(payload: MetaPayload) {
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value;
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) continue;
    const found = await findMetaConnection("whatsapp", phoneNumberId);
    if (!found) continue;
    for (const message of value?.messages || []) {
      if (!message.id || !message.from || message.type !== "text" || !message.text?.body) continue;
      await respond({ provider: "whatsapp", channel: "whatsapp", botId: found.connection.botId, connectionId: found.connection.id, config: found.config, externalThreadId: message.from, externalMessageId: message.id, text: message.text.body, recipientId: message.from, userName: value?.contacts?.[0]?.profile?.name, userPhone: value?.contacts?.[0]?.wa_id });
    }
  }
}

async function handleInstagram(payload: MetaPayload) {
  for (const entry of payload.entry || []) {
    const accountId = entry.id;
    if (!accountId) continue;
    const found = await findMetaConnection("instagram", accountId);
    if (!found) continue;
    for (const event of entry.messaging || []) {
      if (!event.message?.mid || !event.sender?.id || !event.message.text || event.message.is_echo) continue;
      await respond({ provider: "instagram", channel: "instagram", botId: found.connection.botId, connectionId: found.connection.id, config: found.config, externalThreadId: event.sender.id, externalMessageId: event.message.mid, text: event.message.text, recipientId: event.sender.id });
    }
  }
}

async function respond(input: Parameters<typeof processIncomingChannelMessage>[0] & { provider: "whatsapp" | "instagram"; connectionId: string; config: NonNullable<ReturnType<typeof parseMetaConnection>>; recipientId: string }) {
  try {
    const result = await processIncomingChannelMessage(input);
    if (!result.duplicate && !result.handoff) await sendMetaText({ provider: input.provider, config: input.config, recipientId: input.recipientId, text: result.response, messageId: result.assistantMessageId });
    const updated = { ...input.config, lastWebhookAt: new Date().toISOString() };
    await prisma.integrationConnection.update({ where: { id: input.connectionId }, data: { config: JSON.stringify(updated), lastError: null, lastTestedAt: new Date() } });
  } catch (error) {
    await prisma.integrationConnection.update({ where: { id: input.connectionId }, data: { lastError: error instanceof Error ? error.message.slice(0, 500) : "Errore elaborazione messaggio Meta" } }).catch(() => undefined);
  }
}
