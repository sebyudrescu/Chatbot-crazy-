import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const VERSION = 1;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

interface WidgetSessionPayload {
  version: number;
  botId: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}

function signingSecret(env: NodeJS.ProcessEnv = process.env) {
  const dedicated = env.WIDGET_SESSION_SECRET?.trim();
  if (dedicated && dedicated.length >= 32) return dedicated;

  const ownerPassword = env.APP_ACCESS_PASSWORD?.trim();
  const authSalt = env.APP_AUTH_SALT?.trim();
  if (ownerPassword && authSalt && `${authSalt}:${ownerPassword}`.length >= 32) {
    return `${authSalt}:${ownerPassword}:widget-session`;
  }

  if (env.NODE_ENV !== "production") return "litx-local-widget-session-secret-change-in-production";
  throw new Error("WIDGET_SESSION_SECRET non configurato");
}

function signature(payload: string, env: NodeJS.ProcessEnv = process.env) {
  return createHmac("sha256", signingSecret(env)).update(payload).digest("base64url");
}

function equalSignature(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function createWidgetSession(
  botId: string,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
) {
  const payload: WidgetSessionPayload = {
    version: VERSION,
    botId,
    sessionId: randomUUID(),
    issuedAt: now,
    expiresAt: now + MAX_AGE_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    sessionId: payload.sessionId,
    token: `${encoded}.${signature(encoded, env)}`,
    expiresAt: payload.expiresAt,
  };
}

export function readWidgetSession(
  token: string,
  expectedBotId: string,
  expectedSessionId?: string,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
) {
  const [encoded, receivedSignature, ...rest] = token.split(".");
  if (!encoded || !receivedSignature || rest.length) {
    throw new Error("Sessione widget non valida");
  }
  if (!equalSignature(receivedSignature, signature(encoded, env))) {
    throw new Error("Sessione widget non valida");
  }

  let payload: WidgetSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Sessione widget non valida");
  }
  if (
    payload.version !== VERSION
    || payload.botId !== expectedBotId
    || (expectedSessionId && payload.sessionId !== expectedSessionId)
    || !Number.isSafeInteger(payload.issuedAt)
    || !Number.isSafeInteger(payload.expiresAt)
    || payload.issuedAt > now + 60_000
    || payload.expiresAt <= now
    || payload.expiresAt - payload.issuedAt > MAX_AGE_MS
    || !/^[0-9a-f-]{36}$/i.test(payload.sessionId)
  ) {
    throw new Error("Sessione widget non valida");
  }
  return payload;
}

export function widgetSessionToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-litx-widget-session")?.trim() || "";
}
