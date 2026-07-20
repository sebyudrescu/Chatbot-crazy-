import "server-only";

export type MetaProvider = "whatsapp" | "instagram";

export function metaConfiguration() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  const graphVersion = process.env.META_GRAPH_API_VERSION || "";
  const appId = process.env.META_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || "";
  return {
    appUrl,
    graphVersion,
    appId,
    appSecret,
    verifyToken: process.env.META_VERIFY_TOKEN || "",
    encryptionKey: process.env.META_TOKEN_ENCRYPTION_KEY || "",
    whatsappConfigId: process.env.META_WHATSAPP_CONFIG_ID || "",
    instagramAppId: process.env.META_INSTAGRAM_APP_ID || appId,
    instagramAppSecret: process.env.META_INSTAGRAM_APP_SECRET || appSecret,
    graphBaseUrl: process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com",
    instagramGraphBaseUrl: process.env.META_INSTAGRAM_GRAPH_BASE_URL || "https://graph.instagram.com",
  };
}

export function metaReadiness(provider: MetaProvider) {
  const config = metaConfiguration();
  const common = Boolean(config.appUrl.startsWith("https://") && config.graphVersion && config.appSecret && config.verifyToken && config.encryptionKey);
  return provider === "whatsapp"
    ? common && Boolean(config.appId && config.whatsappConfigId)
    : common && Boolean(config.instagramAppId && config.instagramAppSecret);
}
