import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getMetaSetupReport, metaConfiguration } from "@/lib/meta-config";
import { metaTokenExpired, parseMetaConnection } from "@/lib/meta-connections";

export async function GET(request: NextRequest) {
  const botId = z.string().uuid().safeParse(request.nextUrl.searchParams.get("botId"));
  if (!botId.success) return NextResponse.json({ success: false, error: "Agente non valido" }, { status: 400 });
  const [whatsapp, instagram] = await Promise.all(["whatsapp", "instagram"].map(provider => prisma.integrationConnection.findUnique({ where: { botId_provider: { botId: botId.data, provider } } })));
  const meta = metaConfiguration();
  const serialize = (provider: "whatsapp" | "instagram", connection: typeof whatsapp) => {
    const details = connection ? parseMetaConnection(connection.config) : null;
    const hasCredentials = Boolean(details?.accessTokenEncrypted && (provider === "whatsapp" ? details.phoneNumberId : details.instagramAccountId));
    const expired = Boolean(details && metaTokenExpired(details));
    const setup = getMetaSetupReport(provider);
    return { configured: setup.ready, connected: Boolean(hasCredentials && !expired && connection?.enabled && connection.status === "connected"), status: expired ? "expired" : hasCredentials ? connection?.status || "disconnected" : "disconnected", lastError: expired ? "Autorizzazione Meta scaduta: ricollega il canale." : connection?.lastError || null, label: provider === "whatsapp" ? details?.displayPhoneNumber : details?.instagramUsername, setup };
  };
  return NextResponse.json({ success: true, data: { appId: meta.appId, graphVersion: meta.graphVersion, whatsappConfigId: meta.whatsappConfigId, webhookUrl: meta.appUrl ? `${meta.appUrl}/api/meta/webhook/messages` : "", whatsapp: serialize("whatsapp", whatsapp), instagram: serialize("instagram", instagram) } });
}
