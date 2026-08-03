import { createHmac, timingSafeEqual } from "node:crypto";

export interface CommerceClickPayload {
  v: 1;
  b: string;
  p: string;
  c?: string;
  m?: string;
  exp: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signature(encoded: string, secret: string) {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createCommerceClickToken(payload: CommerceClickPayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyCommerceClickToken(token: string, secret: string, now = Date.now()): CommerceClickPayload | null {
  const [encoded, received, extra] = token.split(".");
  if (!encoded || !received || extra || !equal(received, signature(encoded, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CommerceClickPayload;
    if (payload.v !== 1 || !UUID.test(payload.b) || !UUID.test(payload.p)) return null;
    if (payload.c && !UUID.test(payload.c)) return null;
    if (payload.m && !UUID.test(payload.m)) return null;
    if (!Number.isInteger(payload.exp) || payload.exp < Math.floor(now / 1000) || payload.exp > Math.floor(now / 1000) + 32 * 24 * 60 * 60) return null;
    return payload;
  } catch {
    return null;
  }
}
