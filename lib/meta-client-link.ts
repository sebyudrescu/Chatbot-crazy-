import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { metaConfiguration, type MetaProvider } from "./meta-config";

interface MetaClientLinkPayload {
  version: 1;
  botId: string;
  provider: MetaProvider;
  expiresAt: number;
}

type Environment = Record<string, string | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const META_CLIENT_LINK_TTL_MS = 30 * 60_000;

function signingKey(env: Environment) {
  const value = metaConfiguration(env).encryptionKey;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Cifratura Meta non configurata");
  return key;
}

export function createMetaClientLinkToken(
  botId: string,
  provider: MetaProvider,
  now = Date.now(),
  ttlMs = META_CLIENT_LINK_TTL_MS,
  env: Environment = process.env,
) {
  if (!UUID.test(botId) || !["whatsapp", "instagram"].includes(provider)) {
    throw new Error("Dati collegamento cliente non validi");
  }
  const payload: MetaClientLinkPayload = {
    version: 1,
    botId,
    provider,
    expiresAt: now + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingKey(env)).update(encoded).digest("base64url");
  return { token: `${encoded}.${signature}`, expiresAt: payload.expiresAt };
}

export function readMetaClientLinkToken(
  value: string,
  now = Date.now(),
  env: Environment = process.env,
): MetaClientLinkPayload {
  if (!value || value.length > 2_048) throw new Error("Link cliente non valido");
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra) throw new Error("Link cliente non valido");

  const expected = createHmac("sha256", signingKey(env)).update(encoded).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    throw new Error("Link cliente non valido");
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Firma link cliente non valida");
  }

  let payload: MetaClientLinkPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as MetaClientLinkPayload;
  } catch {
    throw new Error("Link cliente non valido");
  }
  if (
    payload.version !== 1 ||
    !UUID.test(payload.botId) ||
    !["whatsapp", "instagram"].includes(payload.provider) ||
    !Number.isSafeInteger(payload.expiresAt)
  ) {
    throw new Error("Link cliente non valido");
  }
  if (payload.expiresAt < now) throw new Error("Link cliente scaduto");
  return payload;
}
