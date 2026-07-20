import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

function encryptionKey(env: NodeJS.ProcessEnv = process.env) {
  const encoded = env.META_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("META_TOKEN_ENCRYPTION_KEY non configurata");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY deve essere una chiave Base64 da 32 byte");
  return key;
}

export function encryptMetaToken(value: string, env: NodeJS.ProcessEnv = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMetaToken(value: string, env: NodeJS.ProcessEnv = process.env) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== VERSION || !iv || !tag || !encrypted) throw new Error("Token Meta cifrato non valido");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function signatureMatches(rawBody: string, signature: string, secret: string) {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifyMetaSignature(rawBody: string, signature: string | null, secret?: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const secrets = secret
    ? [secret]
    : [...new Set([process.env.META_APP_SECRET, process.env.META_INSTAGRAM_APP_SECRET].filter((value): value is string => Boolean(value)))];
  return secrets.some((candidate) => signatureMatches(rawBody, signature, candidate));
}
