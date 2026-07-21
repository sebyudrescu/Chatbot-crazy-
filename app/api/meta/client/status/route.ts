import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readMetaClientLinkToken } from "@/lib/meta-client-link";
import { getMetaSetupReport, metaConfiguration } from "@/lib/meta-config";
import { parseMetaConnection } from "@/lib/meta-connections";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token") || "";
    const link = readMetaClientLinkToken(token);
    const [bot, connection] = await Promise.all([
      prisma.chatbot.findUnique({ where: { id: link.botId }, select: { companyName: true } }),
      prisma.integrationConnection.findUnique({
        where: { botId_provider: { botId: link.botId, provider: link.provider } },
      }),
    ]);
    if (!bot) return NextResponse.json({ success: false, error: "Agente non trovato" }, { status: 404 });
    const details = connection ? parseMetaConnection(connection.config) : null;
    const connected = Boolean(
      connection?.enabled &&
        connection.status === "connected" &&
        details?.accessTokenEncrypted &&
        (link.provider === "whatsapp" ? details.phoneNumberId : details.instagramAccountId),
    );
    const meta = metaConfiguration();
    return NextResponse.json({
      success: true,
      data: {
        provider: link.provider,
        botName: bot.companyName,
        expiresAt: new Date(link.expiresAt).toISOString(),
        configured: getMetaSetupReport(link.provider).ready,
        connected,
        label:
          link.provider === "whatsapp" ? details?.displayPhoneNumber || null : details?.instagramUsername || null,
        appId: link.provider === "whatsapp" ? meta.appId : "",
        graphVersion: meta.graphVersion,
        whatsappConfigId: link.provider === "whatsapp" ? meta.whatsappConfigId : "",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Link cliente non valido" },
      { status: 401 },
    );
  }
}
