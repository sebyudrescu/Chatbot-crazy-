import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dashboardAuthErrorResponse, requireDashboardActor } from "@/lib/workspace-auth";
import { hashUserPassword, verifyUserPassword } from "@/lib/password-hash";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";

const Schema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) });

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    if (actor.kind !== "user" || !actor.sessionId) return NextResponse.json({ success: false, error: "Sessione cliente richiesta" }, { status: 403 });
    const input = Schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ success: false, error: "Password non valida" }, { status: 400 });
    const rate = await checkRateLimit(`password-change:${actor.userId}:${requestClientIp(request.headers)}`, 6, 30 * 60_000);
    if (!rate.allowed) return NextResponse.json({ success: false, error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
    const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { passwordHash: true } });
    if (!user?.passwordHash || !await verifyUserPassword(input.data.currentPassword, user.passwordHash)) return NextResponse.json({ success: false, error: "Password attuale non corretta" }, { status: 401 });
    const passwordHash = await hashUserPassword(input.data.newPassword);
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: actor.userId }, data: { passwordHash } }),
      prisma.userSession.updateMany({ where: { userId: actor.userId, id: { not: actor.sessionId }, revokedAt: null }, data: { revokedAt: now } }),
      prisma.passwordResetToken.updateMany({ where: { userId: actor.userId, usedAt: null }, data: { usedAt: now } }),
    ]);
    return NextResponse.json({ success: true, message: "Password aggiornata. Le altre sessioni sono state revocate." });
  } catch (error) {
    return dashboardAuthErrorResponse(error) || NextResponse.json({ success: false, error: "Aggiornamento non riuscito" }, { status: 500 });
  }
}
