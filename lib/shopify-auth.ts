import "server-only";

import type { IntegrationConnection } from "@prisma/client";
import { prisma } from "./db";
import { decryptConfigSecrets, encryptConfigSecrets } from "./secret-config";
import { normalizeShopDomain } from "./shopify-signatures";

export const SHOPIFY_SCOPES = ["read_products", "read_orders"] as const;
export const SHOPIFY_API_VERSION = "2026-07";

export interface ShopifyTokenResponse {
  access_token: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

export interface ShopifyConnectionConfig extends Record<string, unknown> {
  shopUrl: string;
  shopDomain: string;
  apiVersion: string;
  accessToken?: string;
  adminAccessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  scopes?: string;
  authMode?: "oauth" | "manual";
  orderTrackingPcdStatus?: "unknown" | "ready" | "required";
}

export function shopifyEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.SHOPIFY_CLIENT_ID?.trim() || "";
  const clientSecret = env.SHOPIFY_CLIENT_SECRET?.trim() || "";
  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || "";
  const appUrl = (env.NEXT_PUBLIC_APP_URL || (vercelHost ? `https://${vercelHost}` : ""))
    .trim()
    .replace(/\/$/, "");
  let publicAppUrl = "";
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol === "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) publicAppUrl = parsed.origin;
  } catch {}
  return {
    clientId,
    clientSecret,
    appUrl: publicAppUrl,
    ready: Boolean(clientId && clientSecret.length >= 16 && publicAppUrl),
    callbackUrl: publicAppUrl ? `${publicAppUrl}/api/shopify/oauth/callback` : "",
    webhookUrl: publicAppUrl ? `${publicAppUrl}/api/shopify/webhooks` : "",
  };
}

export function parseShopifyConfig(value: string) {
  try {
    return decryptConfigSecrets(JSON.parse(value)) as ShopifyConnectionConfig;
  } catch {
    throw new Error("Configurazione Shopify non leggibile");
  }
}

async function tokenRequest(shop: string, body: URLSearchParams) {
  const domain = normalizeShopDomain(shop);
  if (!domain) throw new Error("Negozio Shopify non valido");
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const payload = await response.json().catch(() => null) as ShopifyTokenResponse | { error?: string; error_description?: string } | null;
  if (!response.ok || !payload || !("access_token" in payload)) {
    const message = payload && "error_description" in payload
      ? payload.error_description
      : payload && "error" in payload ? payload.error : null;
    throw new Error(message || `Autorizzazione Shopify HTTP ${response.status}`);
  }
  return payload;
}

export async function exchangeShopifyAuthorizationCode(shop: string, code: string) {
  const env = shopifyEnvironment();
  if (!env.ready) throw new Error("Configurazione Shopify della piattaforma incompleta");
  return tokenRequest(shop, new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    code,
    expiring: "1",
  }));
}

function tokenDates(payload: ShopifyTokenResponse, now = Date.now()) {
  return {
    accessTokenExpiresAt: payload.expires_in ? new Date(now + payload.expires_in * 1000).toISOString() : undefined,
    refreshTokenExpiresAt: payload.refresh_token_expires_in ? new Date(now + payload.refresh_token_expires_in * 1000).toISOString() : undefined,
  };
}

export function shopifyConfigFromToken(shop: string, payload: ShopifyTokenResponse) {
  const domain = normalizeShopDomain(shop);
  if (!domain) throw new Error("Negozio Shopify non valido");
  const dates = tokenDates(payload);
  return {
    shopUrl: `https://${domain}`,
    shopDomain: domain,
    apiVersion: SHOPIFY_API_VERSION,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accessTokenExpiresAt: dates.accessTokenExpiresAt,
    refreshTokenExpiresAt: dates.refreshTokenExpiresAt,
    scopes: payload.scope,
    authMode: "oauth" as const,
  };
}

export async function ensureShopifyAccessToken(connection: IntegrationConnection) {
  const config = parseShopifyConfig(connection.config);
  const legacyToken = typeof config.adminAccessToken === "string" ? config.adminAccessToken : "";
  const accessToken = typeof config.accessToken === "string" ? config.accessToken : legacyToken;
  if (!accessToken) throw new Error("Token Shopify mancante: ricollega il negozio");
  if (!config.accessTokenExpiresAt || new Date(config.accessTokenExpiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return { token: accessToken, config };
  }
  if (!config.refreshToken || !config.shopDomain) throw new Error("Token Shopify scaduto: ricollega il negozio");
  const env = shopifyEnvironment();
  if (!env.ready) throw new Error("Configurazione Shopify della piattaforma incompleta");
  const payload = await tokenRequest(config.shopDomain, new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
  }));
  const dates = tokenDates(payload);
  const nextConfig: ShopifyConnectionConfig = {
    ...config,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || config.refreshToken,
    accessTokenExpiresAt: dates.accessTokenExpiresAt,
    refreshTokenExpiresAt: dates.refreshTokenExpiresAt || config.refreshTokenExpiresAt,
    scopes: payload.scope || config.scopes,
  };
  await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: { config: JSON.stringify(encryptConfigSecrets(nextConfig)), lastError: null },
  });
  return { token: payload.access_token, config: nextConfig };
}
