import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { wooCommerceEnvironment } from "@/lib/woocommerce-auth";

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get("botId") || "";
  if (!z.string().uuid().safeParse(botId).success) return NextResponse.json({ success: false, error: "Agente non valido" }, { status: 400 });
  const [environment, connection] = await Promise.all([
    Promise.resolve(wooCommerceEnvironment()),
    prisma.integrationConnection.findUnique({ where: { botId_provider: { botId, provider: "woocommerce" } }, select: { enabled: true, status: true, externalAccountId: true, lastError: true, lastTestedAt: true } }),
  ]);
  return NextResponse.json({ success: true, data: { configured: environment.ready, connected: Boolean(connection?.enabled && connection.status === "connected"), status: connection?.status || "disconnected", storeOrigin: connection?.externalAccountId || null, callbackUrl: environment.callbackUrl, webhookUrl: environment.webhookUrl, lastError: connection?.lastError || null, lastSyncedAt: connection?.lastTestedAt || null } });
}
