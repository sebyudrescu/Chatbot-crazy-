import { createHash, randomBytes } from "node:crypto";

export function createInvitationToken() {
  return randomBytes(48).toString("base64url");
}

export function invitationTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isInvitationToken(value: string) {
  return /^[A-Za-z0-9_-]{64}$/.test(value);
}
