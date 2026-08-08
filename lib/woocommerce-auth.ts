import "server-only";

import type { IntegrationConnection } from "@prisma/client";
import { prisma } from "./db";
import { decryptConfigSecrets, encryptConfigSecrets } from "./secret-config";
import { assertSafeRemoteUrl } from "./url-safety";

export interface WooCommerceConnectionConfig extends Record<string, unknown> {
  storeUrl: string;
  consumerKey?: string;
  consumerSecret?: string;
  webhookSecret?: string;
  authMode?: "oauth" | "public";
  apiVersion?: string;
}

export function wooCommerceEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || "";
  const candidate = (env.NEXT_PUBLIC_APP_URL || (host ? `https://${host}` : "")).replace(/\/$/, "");
  let appUrl = "";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) appUrl = parsed.origin;
  } catch {}
  return {
    appUrl,
    ready: Boolean(appUrl),
    callbackUrl: appUrl ? `${appUrl}/api/woocommerce/oauth/callback` : "",
    returnUrl: appUrl ? `${appUrl}/api/woocommerce/oauth/return` : "",
    webhookUrl: appUrl ? `${appUrl}/api/woocommerce/webhooks` : "",
  };
}

export function parseWooCommerceConfig(value: string) {
  try { return decryptConfigSecrets(JSON.parse(value)) as WooCommerceConnectionConfig; }
  catch { throw new Error("Configurazione WooCommerce non leggibile"); }
}

export async function wooCommerceRequest(
  config: WooCommerceConnectionConfig,
  path: string,
  init: RequestInit = {},
) {
  return (await wooCommerceRequestWithMeta(config, path, init)).data;
}

export async function wooCommerceRequestWithMeta<T = any>(
  config: WooCommerceConnectionConfig,
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; headers: Headers }> {
  const store = await assertSafeRemoteUrl(String(config.storeUrl || ""));
  if (!config.consumerKey || !config.consumerSecret) throw new Error("Credenziali WooCommerce mancanti: ricollega il negozio");
  const endpoint = new URL(path, store.origin);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64")}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => null) as any;
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1_000, 5_000)
        : 500 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!response.ok) throw new Error(payload?.message || `WooCommerce API HTTP ${response.status}`);
    return { data: payload as T, headers: response.headers };
  }
  throw new Error("WooCommerce API non disponibile dopo i tentativi previsti");
}

const WOO_TOPICS = ["product.created", "product.updated", "product.deleted", "order.created", "order.updated"] as const;

export async function registerWooCommerceWebhooks(connection: IntegrationConnection) {
  const config = parseWooCommerceConfig(connection.config);
  const environment = wooCommerceEnvironment();
  if (!environment.ready || !config.webhookSecret) throw new Error("Webhook WooCommerce non configurato");
  const current = await wooCommerceRequest(config, "/wp-json/wc/v3/webhooks?per_page=100");
  const installed = new Set((Array.isArray(current) ? current : [])
    .filter((item: any) => item.delivery_url === environment.webhookUrl && item.status === "active")
    .map((item: any) => String(item.topic)));
  await Promise.all(WOO_TOPICS.filter((topic) => !installed.has(topic)).map((topic) => wooCommerceRequest(config, "/wp-json/wc/v3/webhooks", {
    method: "POST",
    body: JSON.stringify({ name: `LitX ${topic}`, topic, delivery_url: environment.webhookUrl, secret: config.webhookSecret, status: "active" }),
  })));
}

export async function saveWooCommerceConnection(input: {
  botId: string;
  storeOrigin: string;
  consumerKey: string;
  consumerSecret: string;
  webhookSecret: string;
}) {
  const config: WooCommerceConnectionConfig = {
    storeUrl: input.storeOrigin,
    consumerKey: input.consumerKey,
    consumerSecret: input.consumerSecret,
    webhookSecret: input.webhookSecret,
    authMode: "oauth",
    apiVersion: "wc/v3",
  };
  return prisma.integrationConnection.upsert({
    where: { botId_provider: { botId: input.botId, provider: "woocommerce" } },
    create: { botId: input.botId, provider: "woocommerce", category: "commerce", displayName: "WooCommerce", externalAccountId: input.storeOrigin, config: JSON.stringify(encryptConfigSecrets(config)), status: "connecting", enabled: true },
    update: { externalAccountId: input.storeOrigin, config: JSON.stringify(encryptConfigSecrets(config)), status: "connecting", enabled: true, lastError: null },
  });
}
