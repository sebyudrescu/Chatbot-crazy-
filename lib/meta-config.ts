import "server-only";

export type MetaProvider = "whatsapp" | "instagram";

type Environment = Record<string, string | undefined>;

export interface MetaSetupCheck {
  key: string;
  label: string;
  ready: boolean;
}

export interface MetaSetupReport {
  ready: boolean;
  checks: MetaSetupCheck[];
  missing: string[];
}

export function metaConfiguration(env: Environment = process.env) {
  const appUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  const graphVersion = env.META_GRAPH_API_VERSION || "";
  const appId = env.META_APP_ID || "";
  const appSecret = env.META_APP_SECRET || "";
  return {
    appUrl,
    graphVersion,
    appId,
    appSecret,
    verifyToken: env.META_VERIFY_TOKEN || "",
    encryptionKey: env.META_TOKEN_ENCRYPTION_KEY || "",
    whatsappConfigId: env.META_WHATSAPP_CONFIG_ID || "",
    instagramAppId: env.META_INSTAGRAM_APP_ID || appId,
    instagramAppSecret: env.META_INSTAGRAM_APP_SECRET || appSecret,
    graphBaseUrl: env.META_GRAPH_BASE_URL || "https://graph.facebook.com",
    instagramGraphBaseUrl: env.META_INSTAGRAM_GRAPH_BASE_URL || "https://graph.instagram.com",
  };
}

function publicHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "localhost";
  } catch {
    return false;
  }
}

function validEncryptionKey(value: string) {
  try { return Buffer.from(value, "base64").length === 32; } catch { return false; }
}

export function getMetaSetupReport(provider: MetaProvider, env: Environment = process.env): MetaSetupReport {
  const config = metaConfiguration(env);
  const checks: MetaSetupCheck[] = [
    { key: "NEXT_PUBLIC_APP_URL", label: "Dominio pubblico HTTPS", ready: publicHttpsUrl(config.appUrl) },
    { key: "META_GRAPH_API_VERSION", label: "Versione Meta Graph API", ready: /^v\d+\.\d+$/.test(config.graphVersion) },
    { key: "META_VERIFY_TOKEN", label: "Token di verifica webhook", ready: config.verifyToken.length >= 32 },
    { key: "META_TOKEN_ENCRYPTION_KEY", label: "Cifratura sicura dei token", ready: validEncryptionKey(config.encryptionKey) },
  ];
  if (provider === "whatsapp") {
    checks.push(
      { key: "META_APP_ID", label: "Meta App ID", ready: /^\d{5,}$/.test(config.appId) },
      { key: "META_APP_SECRET", label: "Meta App Secret", ready: config.appSecret.length >= 16 },
      { key: "META_WHATSAPP_CONFIG_ID", label: "Configuration ID Embedded Signup", ready: /^\d{5,}$/.test(config.whatsappConfigId) },
    );
  } else {
    checks.push(
      { key: "META_INSTAGRAM_APP_ID", label: "Instagram App ID", ready: /^\d{5,}$/.test(config.instagramAppId) },
      { key: "META_INSTAGRAM_APP_SECRET", label: "Instagram App Secret", ready: config.instagramAppSecret.length >= 16 },
    );
  }
  return { ready: checks.every(check => check.ready), checks, missing: checks.filter(check => !check.ready).map(check => check.key) };
}

export function metaReadiness(provider: MetaProvider, env: Environment = process.env) {
  return getMetaSetupReport(provider, env).ready;
}
