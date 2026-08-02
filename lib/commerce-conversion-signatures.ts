import { createHmac, timingSafeEqual } from "node:crypto";

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signCommerceConversion(rawBody: string, timestamp: string, secret: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyCommerceConversionSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!timestamp || !signature || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 5 * 60) return false;
  return equal(signature.toLowerCase(), signCommerceConversion(rawBody, timestamp, secret));
}
