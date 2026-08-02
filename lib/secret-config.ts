import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SECRET_MASK = "********";
const ENCRYPTED_PREFIX = "litxenc.v1.";
const secretKey = /secret|token|password|api[_-]?key|consumer[_-]?key|private[_-]?key|authorization/i;

function encryptionKey(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.INTEGRATION_CONFIG_ENCRYPTION_KEY || env.META_TOKEN_ENCRYPTION_KEY;
  if (configured) {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
    if (env.INTEGRATION_CONFIG_ENCRYPTION_KEY) {
      throw new Error("INTEGRATION_CONFIG_ENCRYPTION_KEY deve essere Base64 da 32 byte");
    }
  }
  const material = `${env.APP_AUTH_SALT || ""}:${env.APP_ACCESS_PASSWORD || ""}`;
  if (material.length >= 32) return createHash("sha256").update(material).digest();
  if (env.NODE_ENV !== "production") {
    return createHash("sha256").update("litx-local-integration-encryption-key").digest();
  }
  throw new Error("Cifratura delle integrazioni non configurata");
}

function encryptSecret(value: string, env: NodeJS.ProcessEnv) {
  if (!value || value.startsWith(ENCRYPTED_PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${ENCRYPTED_PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value: string, env: NodeJS.ProcessEnv) {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
  const [iv, tag, encrypted, ...rest] = value.slice(ENCRYPTED_PREFIX.length).split(".");
  if (!iv || !tag || !encrypted || rest.length) throw new Error("Segreto integrazione cifrato non valido");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function transformSecrets(
  value: unknown,
  transform: (value: string) => string,
  parentKey = "",
): unknown {
  if (Array.isArray(value)) return value.map((item) => transformSecrets(item, transform));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      transformSecrets(item, transform, key),
    ]));
  }
  if (
    typeof value === "string"
    && secretKey.test(parentKey)
    && !/encrypted$/i.test(parentKey)
  ) {
    return transform(value);
  }
  return value;
}

export function encryptConfigSecrets<T>(
  value: T,
  env: NodeJS.ProcessEnv = process.env,
): T {
  return transformSecrets(value, (secret) => encryptSecret(secret, env)) as T;
}

export function decryptConfigSecrets<T>(
  value: T,
  env: NodeJS.ProcessEnv = process.env,
): T {
  return transformSecrets(value, (secret) => decryptSecret(secret, env)) as T;
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        secretKey.test(key) && typeof item === "string" && item
          ? SECRET_MASK
          : redactSecrets(item),
      ]),
    ) as T;
  }
  return value;
}

export function restoreMaskedSecrets<T>(next: T, current: unknown): T {
  if (next === SECRET_MASK) return current as T;
  if (Array.isArray(next)) {
    const currentArray = Array.isArray(current) ? current : [];
    return next.map((item, index) =>
      restoreMaskedSecrets(item, currentArray[index]),
    ) as T;
  }
  if (next && typeof next === "object") {
    const currentObject =
      current && typeof current === "object"
        ? (current as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      Object.entries(next as Record<string, unknown>).map(([key, item]) => [
        key,
        restoreMaskedSecrets(item, currentObject[key]),
      ]),
    ) as T;
  }
  return next;
}
