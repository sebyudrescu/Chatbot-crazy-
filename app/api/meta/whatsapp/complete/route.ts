import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { metaConfiguration, metaReadiness } from "@/lib/meta-config";
import { saveMetaConnection } from "@/lib/meta-connections";
import { prisma } from "@/lib/db";

const Schema = z.object({ botId: z.string().uuid(), code: z.string().min(8), wabaId: z.string().min(3), phoneNumberId: z.string().min(3), businessId: z.string().optional() });

export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json());
    if (!metaReadiness("whatsapp")) return NextResponse.json({ success: false, error: "Completa prima la configurazione Meta nelle variabili server." }, { status: 503 });
    const bot = await prisma.chatbot.findUnique({ where: { id: input.botId }, select: { id: true } });
    if (!bot) return NextResponse.json({ success: false, error: "Agente non trovato" }, { status: 404 });
    const meta = metaConfiguration();
    const tokenUrl = new URL(`${meta.graphBaseUrl}/${meta.graphVersion}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", meta.appId);
    tokenUrl.searchParams.set("client_secret", meta.appSecret);
    tokenUrl.searchParams.set("code", input.code);
    const tokenResponse = await fetch(tokenUrl, { headers: { Accept: "application/json" } });
    const tokenData = await tokenResponse.json() as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error?.message || "Meta non ha restituito un token valido");

    const subscription = await fetch(`${meta.graphBaseUrl}/${meta.graphVersion}/${input.wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    if (!subscription.ok) {
      const detail = await subscription.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(detail.error?.message || "Impossibile iscrivere il webhook al WhatsApp Business Account");
    }
    const phoneResponse = await fetch(`${meta.graphBaseUrl}/${meta.graphVersion}/${input.phoneNumberId}?fields=display_phone_number`, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const phone = await phoneResponse.json().catch(() => ({})) as { display_phone_number?: string };
    await saveMetaConnection({ botId: input.botId, provider: "whatsapp", accessToken: tokenData.access_token, details: { wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, businessId: input.businessId, displayPhoneNumber: phone.display_phone_number, tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : undefined } });
    return NextResponse.json({ success: true, data: { displayPhoneNumber: phone.display_phone_number || null } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Collegamento WhatsApp non riuscito" }, { status: 400 });
  }
}
