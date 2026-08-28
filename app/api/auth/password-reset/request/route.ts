import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import { createOpaqueToken, opaqueTokenHash } from "@/lib/account-security";
import { sendPasswordResetEmail } from "@/lib/account-emails";

const Schema = z.object({ email: z.string().trim().email().max(320) });
const GENERIC_MESSAGE = "Se l’indirizzo è associato a un account attivo, riceverai a breve un link valido per 30 minuti.";

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Indirizzo email non valido" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const rate = await checkRateLimit(`password-reset:${requestClientIp(request.headers)}:${opaqueTokenHash(email).slice(0, 20)}`, 4, 30 * 60_000);
  if (!rate.allowed) return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
  if (user?.status === "active") {
    const token = createOpaqueToken(32);
    const now = new Date();
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: opaqueTokenHash(token), expiresAt: new Date(now.getTime() + 30 * 60_000) } }),
    ]);
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
    let origin = process.env.NODE_ENV === "production" ? "" : request.nextUrl.origin;
    try { if (configuredOrigin) origin = new URL(configuredOrigin).origin; } catch { origin = ""; }
    if (origin) {
      const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail({ to: user.email, resetUrl, idempotencyKey: `password-reset:${opaqueTokenHash(token)}` }).catch(() => ({ success: false, error: "Invio non disponibile" }));
    }
  } else {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
}
