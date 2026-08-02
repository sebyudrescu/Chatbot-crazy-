import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { shopifyEnvironment } from "@/lib/shopify-auth";

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get("botId") || "";
  if (!z.string().uuid().safeParse(botId).success) return NextResponse.json({ success: false, error: "Agente non valido" }, { status: 400 });
  const [environment, connection] = await Promise.all([
    Promise.resolve(shopifyEnvironment()),
    prisma.integrationConnection.findUnique({ where: { botId_provider: { botId, provider: "shopify" } }, select: { enabled: true, status: true, externalAccountId: true, lastError: true, lastTestedAt: true } }),
  ]);
  return NextResponse.json({
    success: true,
    data: {
      configured: environment.ready,
      callbackUrl: environment.callbackUrl,
      webhookUrl: environment.webhookUrl,
      connected: Boolean(connection?.enabled && connection.status === "connected"),
      shopDomain: connection?.externalAccountId || null,
      status: connection?.status || "disconnected",
      lastError: connection?.lastError || null,
      lastSyncedAt: connection?.lastTestedAt || null,
    },
  });
}
