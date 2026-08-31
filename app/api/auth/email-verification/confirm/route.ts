import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { opaqueTokenHash } from "@/lib/account-security";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const login = new URL("/login", request.url);
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) { login.searchParams.set("verification", "invalid"); return NextResponse.redirect(login); }
  const now = new Date();
  try {
    const verification = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: opaqueTokenHash(token) }, select: { id: true, userId: true, expiresAt: true, usedAt: true } });
    if (!verification || verification.usedAt || verification.expiresAt <= now) { login.searchParams.set("verification", "invalid"); return NextResponse.redirect(login); }
    await prisma.$transaction(async tx => {
      const claimed = await tx.emailVerificationToken.updateMany({ where: { id: verification.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) throw new Error("Token già usato");
      await tx.user.update({ where: { id: verification.userId }, data: { emailVerifiedAt: now, status: "active" } });
    });
    login.searchParams.set("verification", "success");
    return NextResponse.redirect(login);
  } catch {
    login.searchParams.set("verification", "invalid");
    return NextResponse.redirect(login);
  }
}
