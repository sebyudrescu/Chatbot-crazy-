import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function lookupPepper(env: NodeJS.ProcessEnv = process.env) {
  const value = env.ORDER_LOOKUP_PEPPER
    || env.APP_AUTH_SALT
    || env.SHOPIFY_CLIENT_SECRET
    || (env.NODE_ENV !== "production" ? "litx-local-order-lookup-pepper" : "");
  if (value.length < 16) throw new Error("ORDER_LOOKUP_PEPPER non configurato");
  return value;
}

export function orderLookupDigest(value: string, env: NodeJS.ProcessEnv = process.env) {
  return createHmac("sha256", lookupPepper(env)).update(value).digest("hex");
}

export function safeOrderLookupEqual(left: string, right: string, env: NodeJS.ProcessEnv = process.env) {
  const key = lookupPepper(env);
  const first = createHmac("sha256", key).update(left.trim().toLowerCase()).digest();
  const second = createHmac("sha256", key).update(right.trim().toLowerCase()).digest();
  return timingSafeEqual(first, second);
}

