import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseShopifyConfig, shopifyEnvironment } from "@/lib/shopify-auth";
import { shopifyThemeEditorUrl } from "@/lib/shopify-widget";

export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get("botId") || "";
  if (!z.string().uuid().safeParse(botId).success) return NextResponse.json({ success: false, error: "Agente non valido" }, { status: 400 });
  const [environment, connection] = await Promise.all([
    Promise.resolve(shopifyEnvironment()),
    prisma.integrationConnection.findUnique({ where: { botId_provider: { botId, provider: "shopify" } }, select: { enabled: true, status: true, externalAccountId: true, lastError: true, lastTestedAt: true, config: true } }),
  ]);
  let grantedScopes = new Set<string>();
  let pcdStatus: "unknown" | "ready" | "required" = "unknown";
  if (connection?.config) {
    try {
      const config = parseShopifyConfig(connection.config);
      grantedScopes = new Set(String(config.scopes || "").split(",").map((scope) => scope.trim()).filter(Boolean));
      if (config.orderTrackingPcdStatus === "ready" || config.orderTrackingPcdStatus === "required") pcdStatus = config.orderTrackingPcdStatus;
    } catch {}
  }
  if (connection?.lastError?.includes("Protected Customer Data")) pcdStatus = "required";
  return NextResponse.json({
    success: true,
    data: {
      configured: environment.ready,
      callbackUrl: environment.callbackUrl,
      webhookUrl: environment.webhookUrl,
      connected: Boolean(connection?.enabled && connection.status === "connected"),
      shopDomain: connection?.externalAccountId || null,
      themeEditorUrl: connection?.status === "connected"
        ? shopifyThemeEditorUrl(connection.externalAccountId, environment.clientId)
        : null,
      status: connection?.status || "disconnected",
      lastError: connection?.lastError || null,
      lastSyncedAt: connection?.lastTestedAt || null,
      orderTracking: {
        requested: true,
        granted: grantedScopes.has("read_orders"),
        pcdStatus: grantedScopes.has("read_orders") ? pcdStatus : "scope_required",
      },
    },
  });
}
