import "server-only";
import { prisma } from "@/lib/db";
import { metaConfiguration } from "@/lib/meta-config";
import { metaAccessToken, parseMetaConnection } from "@/lib/meta-connections";

export async function unsubscribeMetaConnection(connection: { id: string; provider: string; config: string }) {
  if (connection.provider !== "whatsapp" && connection.provider !== "instagram") return null;
  const config = parseMetaConnection(connection.config);
  const assetId = connection.provider === "whatsapp" ? config?.wabaId : config?.instagramAccountId;
  if (!config?.accessTokenEncrypted || !assetId) return { attempted: false, success: false };

  const others = await prisma.integrationConnection.findMany({
    where: { id: { not: connection.id }, provider: connection.provider, enabled: true, status: "connected" },
    select: { config: true },
  });
  const sharedSubscription = others.some((item) => {
    const other = parseMetaConnection(item.config);
    return connection.provider === "whatsapp" ? other?.wabaId === assetId : other?.instagramAccountId === assetId;
  });
  if (sharedSubscription) return { attempted: false, success: true };

  try {
    const meta = metaConfiguration();
    const baseUrl = connection.provider === "instagram" ? meta.instagramGraphBaseUrl : meta.graphBaseUrl;
    const response = await fetch(`${baseUrl}/${meta.graphVersion}/${encodeURIComponent(assetId)}/subscribed_apps`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${metaAccessToken(config)}`, Accept: "application/json" },
      cache: "no-store",
    });
    return { attempted: true, success: response.ok };
  } catch {
    return { attempted: true, success: false };
  }
}
