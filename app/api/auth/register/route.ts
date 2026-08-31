import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashUserPassword } from "@/lib/password-hash";
import { checkRateLimit, requestClientIp } from "@/lib/rate-limit";
import { createOpaqueToken, opaqueTokenHash } from "@/lib/account-security";
import { accountEmailConfigured, sendEmailVerification } from "@/lib/account-emails";

const Schema = z.object({
  displayName: z.string().trim().min(2).max(100),
  companyName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(200),
  acceptTerms: z.literal(true),
});

function slugBase(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 56) || "workspace";
}

export async function POST(request: NextRequest) {
  if (process.env.SELF_SERVICE_SIGNUP_ENABLED !== "true") return NextResponse.json({ success: false, error: "Registrazione non ancora aperta" }, { status: 503 });
  if (!accountEmailConfigured()) return NextResponse.json({ success: false, error: "Registrazione temporaneamente non disponibile" }, { status: 503 });
  let input: z.infer<typeof Schema>;
  try { input = Schema.parse(await request.json()); } catch { return NextResponse.json({ success: false, error: "Controlla i dati inseriti" }, { status: 400 }); }
  const email = input.email.toLowerCase();
  const rate = await checkRateLimit(`register:${requestClientIp(request.headers)}:${email}`, 4, 60 * 60_000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Troppi tentativi. Riprova più tardi." }, { status: 429 });
  try {
    const passwordHash = await hashUserPassword(input.password);
    const verificationToken = createOpaqueToken(32);
    const suffix = crypto.randomUUID().slice(0, 8);
    const result = await prisma.$transaction(async tx => {
      const workspace = await tx.workspace.create({ data: { name: input.companyName, slug: `${slugBase(input.companyName)}-${suffix}`, kind: "client" } });
      const user = await tx.user.create({ data: { displayName: input.displayName, email, passwordHash, status: "pending_verification" } });
      await tx.workspaceMembership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
      await tx.emailVerificationToken.create({ data: { userId: user.id, tokenHash: opaqueTokenHash(verificationToken), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
      await tx.workspaceAuditLog.create({ data: { workspaceId: workspace.id, actorUserId: user.id, action: "workspace.self_service_registered", targetType: "workspace", targetId: workspace.id, metadata: JSON.stringify({ termsAccepted: true, termsVersion: process.env.TERMS_VERSION || "2026-08-31" }) } });
      return { workspace, user };
    });
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).origin;
    const delivery = await sendEmailVerification({ to: result.user.email, verificationUrl: `${origin}/api/auth/email-verification/confirm?token=${encodeURIComponent(verificationToken)}`, idempotencyKey: `email-verification:${opaqueTokenHash(verificationToken)}` });
    return NextResponse.json({ success: true, data: { workspaceId: result.workspace.id, verificationRequired: true, emailSent: delivery.success } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ success: false, error: "Non è possibile completare la registrazione con questi dati" }, { status: 409 });
    return NextResponse.json({ success: false, error: "Registrazione non riuscita" }, { status: 500 });
  }
}
