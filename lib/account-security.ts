import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function securityKey() {
  const salt = process.env.APP_AUTH_SALT;
  if (!salt && process.env.NODE_ENV === "production") throw new Error("APP_AUTH_SALT non configurato");
  return createHash("sha256").update(`litx-account-security:${salt || "local-development-only"}`).digest();
}

export function opaqueTokenHash(token: string) {
  return createHmac("sha256", securityKey()).update(token).digest("hex");
}

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function encryptAccountSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", securityKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptAccountSecret(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Segreto account non valido");
  const decipher = createDecipheriv("aes-256-gcm", securityKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

function base32Encode(input: Buffer) {
  let bits = 0, value = 0, output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string) {
  let bits = 0, value = 0;
  const output: number[] = [];
  for (const character of input.toUpperCase().replace(/=+$/g, "")) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error("Segreto TOTP non valido");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function createTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function createTotpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const received = Buffer.from(normalized);
  return [-30_000, 0, 30_000].some(offset => timingSafeEqual(received, Buffer.from(createTotpCode(secret, now + offset))));
}

export function createRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString("hex").toUpperCase();
    return `${raw.slice(0, 8)}-${raw.slice(8)}`;
  });
}

export function recoveryCodeHash(userId: string, code: string) {
  return createHmac("sha256", securityKey()).update(`${userId}:${code.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`).digest("hex");
}

export function deviceLabel(userAgent: string | null) {
  const value = userAgent || "";
  const browser = /Edg\//.test(value) ? "Edge" : /OPR\//.test(value) ? "Opera" : /Chrome\//.test(value) ? "Chrome" : /Firefox\//.test(value) ? "Firefox" : /Safari\//.test(value) ? "Safari" : "Browser";
  const system = /iPhone|iPad/.test(value) ? "iOS" : /Android/.test(value) ? "Android" : /Windows/.test(value) ? "Windows" : /Mac OS/.test(value) ? "macOS" : /Linux/.test(value) ? "Linux" : "dispositivo sconosciuto";
  return `${browser} su ${system}`.slice(0, 120);
}

export function requestIpHash(headers: Headers) {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return ip ? createHmac("sha256", securityKey()).update(ip).digest("hex") : null;
}

export function totpProvisioningUri(input: { secret: string; email: string; issuer?: string }) {
  const issuer = input.issuer || "LitX AI";
  const label = `${issuer}:${input.email}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(input.secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
