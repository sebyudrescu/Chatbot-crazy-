import "server-only";
import { prisma } from "@/lib/db";
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta-security";
import type { MetaProvider } from "@/lib/meta-config";

export interface MetaConnectionConfig {
  accessTokenEncrypted: string;
  businessId?: string;
  wabaId?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  connectedAt: string;
  tokenExpiresAt?: string;
  lastWebhookAt?: string;
}

export function parseMetaConnection(value: string): MetaConnectionConfig | null {
  try { return JSON.parse(value) as MetaConnectionConfig; } catch { return null; }
}

export async function saveMetaConnection(input: { botId: string; provider: MetaProvider; accessToken: string; details: Omit<MetaConnectionConfig, "accessTokenEncrypted" | "connectedAt"> }) {
  const config: MetaConnectionConfig = { ...input.details, accessTokenEncrypted: encryptMetaToken(input.accessToken), connectedAt: new Date().toISOString() };
  const displayName = input.provider === "whatsapp" ? "WhatsApp Business" : "Instagram Direct";
  return prisma.integrationConnection.upsert({
    where: { botId_provider: { botId: input.botId, provider: input.provider } },
    create: { botId: input.botId, provider: input.provider, category: "channels", displayName, config: JSON.stringify(config), status: "connected", enabled: true },
    update: { config: JSON.stringify(config), status: "connected", enabled: true, lastError: null, lastTestedAt: new Date() },
  });
}

export function metaAccessToken(config: MetaConnectionConfig) { return decryptMetaToken(config.accessTokenEncrypted); }

export async function findMetaConnection(provider: MetaProvider, assetId: string) {
  const connections = await prisma.integrationConnection.findMany({ where: { provider, enabled: true, status: "connected" } });
  for (const connection of connections) {
    const config = parseMetaConnection(connection.config);
    if (!config) continue;
    const matches = provider === "whatsapp" ? config.phoneNumberId === assetId : config.instagramAccountId === assetId;
    if (matches) return { connection, config };
  }
  return null;
}
