import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dashboardAuthErrorResponse, requireDashboardActor } from "@/lib/workspace-auth";
import { createRecoveryCodes, decryptAccountSecret, recoveryCodeHash, verifyTotp } from "@/lib/account-security";

const Schema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    if (actor.kind !== "user" || !actor.sessionId) return NextResponse.json({ success: false, error: "Sessione cliente richiesta" }, { status: 403 });
    const input = Schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ success: false, error: "Codice non valido" }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { mfaSecretEncrypted: true, mfaEnabledAt: true } });
    if (!user?.mfaSecretEncrypted || user.mfaEnabledAt) return NextResponse.json({ success: false, error: "Configurazione MFA non disponibile" }, { status: 409 });
    const secret = decryptAccountSecret(user.mfaSecretEncrypted);
    if (!verifyTotp(secret, input.data.code)) return NextResponse.json({ success: false, error: "Codice non corretto" }, { status: 401 });
    const recoveryCodes = createRecoveryCodes();
    await prisma.user.update({ where: { id: actor.userId }, data: { mfaEnabledAt: new Date(), mfaRecoveryCodeHashes: JSON.stringify(recoveryCodes.map(code => recoveryCodeHash(actor.userId, code))) } });
    await prisma.userSession.updateMany({ where: { userId: actor.userId, id: { not: actor.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
    return NextResponse.json({ success: true, data: { recoveryCodes } });
  } catch (error) {
    return dashboardAuthErrorResponse(error) || NextResponse.json({ success: false, error: "Attivazione MFA non riuscita" }, { status: 500 });
  }
}
