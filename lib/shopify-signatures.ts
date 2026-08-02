import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface ShopifyOAuthState {
  botId: string;
  shop: string;
  nonce: string;
  expiresAt: number;
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeShopDomain(value: string) {
  const candidate = value.trim().toLowerCase();
  let hostname = candidate;
  try {
    hostname = new URL(candidate.includes("://") ? candidate : `https://${candidate}`).hostname;
  } catch {
    return null;
  }
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(hostname) ? hostname : null;
}

export function createShopifyOAuthState(
  botId: string,
  shop: string,
  secret: string,
  now = Date.now(),
) {
  const payload: ShopifyOAuthState = {
    botId,
    shop,
    nonce: randomBytes(18).toString("base64url"),
    expiresAt: now + 10 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyShopifyOAuthState(
  state: string,
  secret: string,
  now = Date.now(),
) {
  const [encoded, signature, ...rest] = state.split(".");
  if (!encoded || !signature || rest.length) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ShopifyOAuthState;
    if (
      !payload.botId
      || !payload.nonce
      || normalizeShopDomain(payload.shop) !== payload.shop
      || !Number.isFinite(payload.expiresAt)
      || payload.expiresAt < now
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyShopifyOAuthHmac(params: URLSearchParams, secret: string) {
  const received = params.get("hmac") || "";
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const message = [...params.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  return constantTimeEqual(received.toLowerCase(), expected);
}

export function verifyShopifyWebhookHmac(rawBody: string, received: string | null, secret: string) {
  if (!received) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return constantTimeEqual(received, expected);
}
