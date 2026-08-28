import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dashboardAuthErrorResponse, requireDashboardActor } from "@/lib/workspace-auth";
import { decryptAccountSecret, recoveryCodeHash, verifyTotp } from "@/lib/account-security";
import { verifyUserPassword } from "@/lib/password-hash";

const Schema = z.object({ password: z.string().min(1).max(256), code: z.string().trim().min(6).max(32) });

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    if (actor.kind !== "user" || !actor.sessionId) return NextResponse.json({ success: false, error: "Sessione cliente richiesta" }, { status: 403 });
    const input = Schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ success: false, error: "Dati non validi" }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { passwordHash: true, mfaSecretEncrypted: true, mfaEnabledAt: true, mfaRecoveryCodeHashes: true } });
    if (!user?.passwordHash || !user.mfaSecretEncrypted || !user.mfaEnabledAt || !await verifyUserPassword(input.data.password, user.passwordHash)) return NextResponse.json({ success: false, error: "Verifica non riuscita" }, { status: 401 });
    const recoveryHashes = JSON.parse(user.mfaRecoveryCodeHashes || "[]") as string[];
    const valid = verifyTotp(decryptAccountSecret(user.mfaSecretEncrypted), input.data.code) || recoveryHashes.includes(recoveryCodeHash(actor.userId, input.data.code));
    if (!valid) return NextResponse.json({ success: false, error: "Codice non corretto" }, { status: 401 });
    await prisma.$transaction([
      prisma.user.update({ where: { id: actor.userId }, data: { mfaSecretEncrypted: null, mfaRecoveryCodeHashes: null, mfaEnabledAt: null } }),
      prisma.userSession.updateMany({ where: { userId: actor.userId, id: { not: actor.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.mfaChallenge.updateMany({ where: { userId: actor.userId, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return dashboardAuthErrorResponse(error) || NextResponse.json({ success: false, error: "Disattivazione MFA non riuscita" }, { status: 500 });
  }
}
