import { after, type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { metaConfiguration } from "@/lib/meta-config";
import { findMetaConnection, parseMetaConnection } from "@/lib/meta-connections";
import { verifyMetaSignature } from "@/lib/meta-security";
import { processIncomingChannelMessage } from "@/lib/channel-message-processor";
import { sendMetaText } from "@/lib/meta-messaging";
import { normalizeMetaDeliveryStatus, shouldAdvanceDeliveryStatus } from "@/lib/meta-payloads";
import { analyzeMetaAttachment, instagramAttachmentDescriptor, unsupportedAttachment, whatsappAttachmentDescriptor, type MetaAttachmentDescriptor } from "@/lib/meta-attachments";
import { checkRateLimit } from "@/lib/rate-limit";

type WhatsAppMessage = { id?: string; from?: string; type?: string; text?: { body?: string }; image?: { id?: string; mime_type?: string; caption?: string }; document?: { id?: string; mime_type?: string; filename?: string; caption?: string }; audio?: { id?: string; mime_type?: string }; video?: { id?: string; mime_type?: string; caption?: string }; sticker?: { id?: string; mime_type?: string } };
type WhatsAppStatus = { id?: string; status?: string; errors?: Array<{ code?: number; title?: string; message?: string }> };
type WhatsAppValue = { metadata?: { phone_number_id?: string }; contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>; messages?: WhatsAppMessage[]; statuses?: WhatsAppStatus[] };
type InstagramEvent = { sender?: { id?: string }; recipient?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string; payload?: { url?: string } }> } };
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

export const maxDuration = 60;

async function handleWhatsApp(payload: MetaPayload) {
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value;
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) continue;
    const found = await findMetaConnection("whatsapp", phoneNumberId);
    if (!found) continue;
    for (const status of value?.statuses || []) await updateWhatsAppDeliveryStatus(status, found.connection.id, found.config);
    for (const message of value?.messages || []) {
      if (!message.id || !message.from) continue;
      if (await alreadyProcessed(message.id)) continue;
      const descriptor = whatsappAttachmentDescriptor(message);
      const attachment = descriptor ? await analyzeAttachmentLimited("whatsapp", descriptor, found.connection.botId, message.from, found.config) : null;
      const text = attachment?.displayText || message.text?.body?.trim() || "";
      if (!text) continue;
      await respond({ provider: "whatsapp", channel: "whatsapp", botId: found.connection.botId, connectionId: found.connection.id, config: found.config, externalThreadId: message.from, externalMessageId: message.id, text, analysisText: attachment?.queryText, recipientId: message.from, userName: value?.contacts?.[0]?.profile?.name, userPhone: value?.contacts?.[0]?.wa_id });
    }
  }
}

async function updateWhatsAppDeliveryStatus(status: WhatsAppStatus, connectionId: string, config: NonNullable<ReturnType<typeof parseMetaConnection>>) {
  if (!status.id || !status.status) return;
  const normalized = normalizeMetaDeliveryStatus(status.status);
  if (!normalized) return;
  const message = await prisma.message.findUnique({ where: { externalMessageId: status.id }, select: { id: true, channel: true, deliveryStatus: true } });
  if (message?.channel === "whatsapp" && shouldAdvanceDeliveryStatus(message.deliveryStatus, normalized)) {
    await prisma.message.update({ where: { id: message.id }, data: { deliveryStatus: normalized } });
  }
  const failure = normalized === "failed" ? status.errors?.[0] : undefined;
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: {
      config: JSON.stringify({ ...config, lastWebhookAt: new Date().toISOString() }),
      lastTestedAt: new Date(),
      ...(failure ? { lastError: (failure.message || failure.title || `Errore Meta ${failure.code || ""}`).slice(0, 500) } : {}),
    },
  });
}

async function handleInstagram(payload: MetaPayload) {
  for (const entry of payload.entry || []) {
    const accountId = entry.id;
    if (!accountId) continue;
    const found = await findMetaConnection("instagram", accountId);
    if (!found) continue;
    for (const event of entry.messaging || []) {
      if (!event.message?.mid || !event.sender?.id || event.message.is_echo) continue;
      if (await alreadyProcessed(event.message.mid)) continue;
      const descriptors = (event.message.attachments || []).map(instagramAttachmentDescriptor).filter((item): item is MetaAttachmentDescriptor => Boolean(item)).slice(0, 3);
      const attachmentLimit = descriptors.length ? await checkRateLimit(`meta-attachment:${found.connection.botId}:instagram:${event.sender.id}`, 10, 5 * 60_000) : null;
      const attachments = attachmentLimit?.allowed === false
        ? descriptors.map(descriptor => unsupportedAttachment(descriptor))
        : await Promise.all(descriptors.map(descriptor => analyzeAttachment("instagram", descriptor, found.connection.botId, found.config)));
      const displayText = [event.message.text?.trim(), ...attachments.map(item => item.displayText)].filter(Boolean).join("\n");
      const analysisText = [event.message.text?.trim(), ...attachments.map(item => item.queryText)].filter(Boolean).join("\n\n");
      if (!displayText) continue;
      await respond({ provider: "instagram", channel: "instagram", botId: found.connection.botId, connectionId: found.connection.id, config: found.config, externalThreadId: event.sender.id, externalMessageId: event.message.mid, text: displayText, analysisText: analysisText || undefined, recipientId: event.sender.id });
    }
  }
}

async function alreadyProcessed(externalMessageId: string) {
  return Boolean(await prisma.message.findUnique({ where: { externalMessageId }, select: { id: true } }));
}

async function analyzeAttachmentLimited(provider: "whatsapp" | "instagram", descriptor: MetaAttachmentDescriptor, botId: string, externalThreadId: string, config: NonNullable<ReturnType<typeof parseMetaConnection>>) {
  const limit = await checkRateLimit(`meta-attachment:${botId}:${provider}:${externalThreadId}`, 10, 5 * 60_000);
  return limit.allowed ? analyzeAttachment(provider, descriptor, botId, config) : unsupportedAttachment(descriptor);
}

async function analyzeAttachment(provider: "whatsapp" | "instagram", descriptor: MetaAttachmentDescriptor, botId: string, config: NonNullable<ReturnType<typeof parseMetaConnection>>) {
  try {
    return await analyzeMetaAttachment({ provider, descriptor, botId, config });
  } catch {
    return unsupportedAttachment(descriptor);
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
