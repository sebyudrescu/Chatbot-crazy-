import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { parseJSON } from "./utils";

const KEY_PREFIX = "litx_live_";
const ALLOWED_SCOPES = new Set(["chat:write"]);

export function hashAgentApiKey(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function publicAgentApiKey(item: {
  id: string; botId: string; name: string; keyPrefix: string; scopes: string;
  lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date;
}) {
  return { ...item, scopes: parseJSON<string[]>(item.scopes) || [], secretHash: undefined };
}

export async function createAgentApiKey(input: { botId: string; name: string; expiresInDays?: number | null }) {
  const bot = await prisma.chatbot.findUnique({ where: { id: input.botId }, select: { id: true } });
  if (!bot) throw new Error("Agente non trovato");
  const secret = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const created = await prisma.agentApiKey.create({
    data: {
      botId: input.botId,
      name: input.name.trim(),
      keyPrefix: secret.slice(0, 18),
      secretHash: hashAgentApiKey(secret),
      scopes: JSON.stringify(["chat:write"]),
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    },
  });
  await prisma.event.create({ data: { botId: input.botId, eventType: "agent_api_key.created", category: "security", severity: "info", metadata: JSON.stringify({ apiKeyId: created.id, keyPrefix: created.keyPrefix }) } });
  return { ...publicAgentApiKey(created), secret };
}

export async function authenticateAgentApiKey(authorization: string | null, botId: string, requiredScope: string) {
  const match = authorization?.match(/^Bearer\s+(litx_live_[A-Za-z0-9_-]{40,})$/);
  if (!match || !ALLOWED_SCOPES.has(requiredScope)) return null;
  const item = await prisma.agentApiKey.findUnique({
    where: { secretHash: hashAgentApiKey(match[1]) },
    include: { chatbot: { select: { id: true, isActive: true } } },
  });
  const scopes = item ? parseJSON<string[]>(item.scopes) || [] : [];
  if (!item || item.botId !== botId || !item.chatbot.isActive || item.revokedAt || (item.expiresAt && item.expiresAt <= new Date()) || !scopes.includes(requiredScope)) return null;
  await prisma.agentApiKey.update({ where: { id: item.id }, data: { lastUsedAt: new Date() } });
  return { id: item.id, botId: item.botId, keyPrefix: item.keyPrefix, scopes };
}

export async function revokeAgentApiKey(id: string) {
  const current = await prisma.agentApiKey.findUnique({ where: { id } });
  if (!current || current.revokedAt) throw new Error("Chiave API non trovata o già revocata");
  const updated = await prisma.agentApiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await prisma.event.create({ data: { botId: current.botId, eventType: "agent_api_key.revoked", category: "security", severity: "warning", metadata: JSON.stringify({ apiKeyId: id, keyPrefix: current.keyPrefix }) } });
  return publicAgentApiKey(updated);
}
