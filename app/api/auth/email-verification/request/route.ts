import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createOpaqueToken, opaqueTokenHash } from "@/lib/account-security";
import { accountEmailConfigured, sendEmailVerification } from "@/lib/account-emails";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";

const Schema = z.object({ email: z.string().trim().email().max(320) });
const MESSAGE = "Se l’account è in attesa di verifica, riceverai un nuovo link.";

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Email non valida" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const rate = await checkRateLimit(`email-verification:${requestClientIp(request.headers)}:${opaqueTokenHash(email).slice(0, 20)}`, 4, 60 * 60_000);
  if (!rate.allowed || !accountEmailConfigured()) return NextResponse.json({ success: true, message: MESSAGE });
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true, emailVerifiedAt: true } });
  if (user && !user.emailVerifiedAt && user.status === "pending_verification") {
    const token = createOpaqueToken(32);
    const now = new Date();
    await prisma.$transaction([
      prisma.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
      prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: opaqueTokenHash(token), expiresAt: new Date(now.getTime() + 24 * 60 * 60_000) } }),
    ]);
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).origin;
    await sendEmailVerification({ to: user.email, verificationUrl: `${origin}/api/auth/email-verification/confirm?token=${encodeURIComponent(token)}`, idempotencyKey: `email-verification:${opaqueTokenHash(token)}` }).catch(() => ({ success: false, error: "Invio non disponibile" }));
  } else {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return NextResponse.json({ success: true, message: MESSAGE });
}
