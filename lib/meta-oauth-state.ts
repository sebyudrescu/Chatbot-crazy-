import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MetaProvider } from "@/lib/meta-config";

interface OAuthState { botId: string; provider: MetaProvider; expiresAt: number }

function secret(provider: MetaProvider) {
  const value = provider === "instagram"
    ? process.env.META_INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
    : process.env.META_APP_SECRET;
  if (!value) throw new Error(`Segreto Meta ${provider} non configurato`);
  return value;
}

export function createMetaOAuthState(botId: string, provider: MetaProvider, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ botId, provider, expiresAt: now + 10 * 60_000 } satisfies OAuthState)).toString("base64url");
  const signature = createHmac("sha256", secret(provider)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readMetaOAuthState(value: string, now = Date.now()): OAuthState {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("Stato OAuth non valido");
  let parsed: OAuthState;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  } catch {
    throw new Error("Stato OAuth non valido");
  }
  if (!parsed.botId || !["whatsapp", "instagram"].includes(parsed.provider)) throw new Error("Stato OAuth non valido");
  const expected = createHmac("sha256", secret(parsed.provider)).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) throw new Error("Firma OAuth non valida");
  if (parsed.expiresAt < now) throw new Error("Stato OAuth scaduto");
  return parsed;
}
