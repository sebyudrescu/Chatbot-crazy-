import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dashboardAuthErrorResponse, requireDashboardActor } from "@/lib/workspace-auth";
import { createTotpSecret, encryptAccountSecret, totpProvisioningUri } from "@/lib/account-security";
import { verifyUserPassword } from "@/lib/password-hash";

const Schema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    if (actor.kind !== "user") return NextResponse.json({ success: false, error: "Disponibile solo per account cliente" }, { status: 403 });
    const input = Schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ success: false, error: "Password richiesta" }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { email: true, passwordHash: true, mfaEnabledAt: true } });
    if (!user?.passwordHash || !await verifyUserPassword(input.data.password, user.passwordHash)) return NextResponse.json({ success: false, error: "Password non corretta" }, { status: 401 });
    if (user.mfaEnabledAt) return NextResponse.json({ success: false, error: "La verifica in due passaggi è già attiva" }, { status: 409 });
    const secret = createTotpSecret();
    await prisma.user.update({ where: { id: actor.userId }, data: { mfaSecretEncrypted: encryptAccountSecret(secret), mfaRecoveryCodeHashes: null } });
    return NextResponse.json({ success: true, data: { secret, provisioningUri: totpProvisioningUri({ secret, email: user.email }) } });
  } catch (error) {
    return dashboardAuthErrorResponse(error) || NextResponse.json({ success: false, error: "Configurazione MFA non riuscita" }, { status: 500 });
  }
}
