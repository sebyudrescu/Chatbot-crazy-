import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface WooCommerceOAuthState {
  botId: string;
  storeOrigin: string;
  nonce: string;
  expiresAt: number;
}

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function wooSigningSecret(env: NodeJS.ProcessEnv = process.env) {
  const material = `${env.APP_AUTH_SALT || ""}:${env.APP_ACCESS_PASSWORD || ""}`;
  if (material.length < 32) throw new Error("Firma WooCommerce non configurata");
  return createHash("sha256").update(`litx-woocommerce:${material}`).digest("hex");
}

export function createWooCommerceOAuthState(
  botId: string,
  storeOrigin: string,
  secret: string,
  now = Date.now(),
) {
  const payload: WooCommerceOAuthState = { botId, storeOrigin, nonce: randomBytes(18).toString("base64url"), expiresAt: now + 15 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyWooCommerceOAuthState(state: string, secret: string, now = Date.now()) {
  const [encoded, signature, ...rest] = state.split(".");
  if (!encoded || !signature || rest.length) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!equal(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as WooCommerceOAuthState;
    const origin = new URL(payload.storeOrigin).origin;
    if (!payload.botId || !payload.nonce || origin !== payload.storeOrigin || payload.expiresAt < now) return null;
    return payload;
  } catch { return null; }
}

export function verifyWooCommerceWebhookHmac(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return equal(signature, expected);
}
