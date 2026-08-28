import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import { decryptAccountSecret, opaqueTokenHash, recoveryCodeHash, verifyTotp } from "@/lib/account-security";
import { issueUserSession, USER_SESSION_COOKIE, USER_SESSION_MAX_AGE_SECONDS } from "@/lib/workspace-auth";

const Schema = z.object({ challenge: z.string().min(32).max(200), code: z.string().trim().min(6).max(32) });

export async function POST(request: NextRequest) {
  const input = Schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ success: false, error: "Codice non valido" }, { status: 400 });
  const tokenHash = opaqueTokenHash(input.data.challenge);
  const rate = await checkRateLimit(`mfa-login:${requestClientIp(request.headers)}:${tokenHash.slice(0, 20)}`, 8, 15 * 60_000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
  const challenge = await prisma.mfaChallenge.findUnique({ where: { tokenHash }, include: { user: { include: { memberships: { where: { status: "active" }, select: { workspaceId: true, role: true } } } } } });
  const now = new Date();
  if (!challenge || challenge.usedAt || challenge.expiresAt <= now || challenge.attempts >= 6 || challenge.user.status !== "active" || !challenge.user.mfaSecretEncrypted) return NextResponse.json({ success: false, error: "Verifica scaduta. Accedi nuovamente." }, { status: 410 });
  await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
  const recoveryHashes = JSON.parse(challenge.user.mfaRecoveryCodeHashes || "[]") as string[];
  const recoveryHash = recoveryCodeHash(challenge.userId, input.data.code);
  const recoveryIndex = recoveryHashes.indexOf(recoveryHash);
  const valid = verifyTotp(decryptAccountSecret(challenge.user.mfaSecretEncrypted), input.data.code) || recoveryIndex >= 0;
  if (!valid) return NextResponse.json({ success: false, error: "Codice non corretto" }, { status: 401 });
  if (recoveryIndex >= 0) recoveryHashes.splice(recoveryIndex, 1);
  const claimed = await prisma.$transaction(async tx => {
    const result = await tx.mfaChallenge.updateMany({ where: { id: challenge.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (result.count !== 1) return false;
    if (recoveryIndex >= 0) {
      const current = await tx.user.findUnique({ where: { id: challenge.userId }, select: { mfaRecoveryCodeHashes: true } });
      const currentValue = current?.mfaRecoveryCodeHashes || "[]";
      const currentHashes = JSON.parse(currentValue) as string[];
      const currentIndex = currentHashes.indexOf(recoveryHash);
      if (currentIndex < 0) return false;
      currentHashes.splice(currentIndex, 1);
      const consumed = await tx.user.updateMany({ where: { id: challenge.userId, mfaRecoveryCodeHashes: currentValue }, data: { mfaRecoveryCodeHashes: JSON.stringify(currentHashes) } });
      if (consumed.count !== 1) return false;
    }
    return true;
  });
  if (!claimed) return NextResponse.json({ success: false, error: "Verifica o codice già utilizzati" }, { status: 409 });
  const session = await issueUserSession(challenge.userId, { headers: request.headers });
  const response = NextResponse.json({ success: true, mode: "client", data: { displayName: challenge.user.displayName, memberships: challenge.user.memberships } });
  response.cookies.set(USER_SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: USER_SESSION_MAX_AGE_SECONDS, priority: "high" });
  response.cookies.set("litx_owner", "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0, priority: "high" });
  return response;
}
