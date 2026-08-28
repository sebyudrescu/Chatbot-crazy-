import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import { opaqueTokenHash } from "@/lib/account-security";
import { hashUserPassword } from "@/lib/password-hash";
import { USER_SESSION_COOKIE } from "@/lib/workspace-auth";

const Schema = z.object({ token: z.string().min(32).max(200), password: z.string().min(12).max(256) });

export async function POST(request: NextRequest) {
  const input = Schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ success: false, error: "Link o password non validi" }, { status: 400 });
  const tokenHash = opaqueTokenHash(input.data.token);
  const rate = await checkRateLimit(`password-reset-confirm:${requestClientIp(request.headers)}:${tokenHash.slice(0, 20)}`, 8, 30 * 60_000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true, expiresAt: true, usedAt: true } });
  const now = new Date();
  if (!reset || reset.usedAt || reset.expiresAt <= now) return NextResponse.json({ success: false, error: "Link non valido o scaduto" }, { status: 410 });
  const passwordHash = await hashUserPassword(input.data.password);
  const claimed = await prisma.$transaction(async tx => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.userSession.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: now } });
    return true;
  });
  if (!claimed) return NextResponse.json({ success: false, error: "Link già utilizzato" }, { status: 409 });
  const response = NextResponse.json({ success: true, message: "Password aggiornata. Accedi nuovamente." });
  response.cookies.set(USER_SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0, priority: "high" });
  return response;
}
