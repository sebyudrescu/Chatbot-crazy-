import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptConfigSecrets } from "@/lib/secret-config";
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from "@/lib/workspace-auth";

const botSchema = z.object({ botId: z.string().uuid() });

export async function GET(request: NextRequest) {
  try {
  const actor = await requireDashboardActor(request);
  const parsed = botSchema.safeParse({ botId: request.nextUrl.searchParams.get("botId") });
  if (!parsed.success) return NextResponse.json({ success: false, error: "Agente non valido" }, { status: 400 });
  await requireBotPermission(actor, parsed.data.botId, "chatbot.read");
  const key = await prisma.commerceTrackingKey.findUnique({ where: { botId: parsed.data.botId }, select: { id: true, active: true, updatedAt: true } });
  return NextResponse.json({ success: true, data: key ? { keyId: key.id, active: key.active, updatedAt: key.updatedAt } : null });
  } catch (error) { const authResponse = dashboardAuthErrorResponse(error); if (authResponse) return authResponse; return NextResponse.json({ success: false, error: "Chiave non disponibile" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
  const actor = await requireDashboardActor(request);
  const parsed = botSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Agente non valido" }, { status: 400 });
  await requireBotPermission(actor, parsed.data.botId, "chatbot.write");
  const chatbot = await prisma.chatbot.findUnique({ where: { id: parsed.data.botId }, select: { id: true } });
  if (!chatbot) return NextResponse.json({ success: false, error: "Agente non trovato" }, { status: 404 });
  const secret = `litx_ctk_${randomBytes(32).toString("base64url")}`;
  const key = await prisma.commerceTrackingKey.upsert({
    where: { botId: parsed.data.botId },
    create: { botId: parsed.data.botId, config: JSON.stringify(encryptConfigSecrets({ secret })), active: true },
    update: { config: JSON.stringify(encryptConfigSecrets({ secret })), active: true },
    select: { id: true, updatedAt: true },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || request.nextUrl.origin;
  return NextResponse.json({ success: true, data: { keyId: key.id, secret, endpoint: `${appUrl}/api/commerce/conversions`, updatedAt: key.updatedAt, warning: "Il segreto viene mostrato una sola volta. Conservalo soltanto sul server del negozio." } });
  } catch (error) { const authResponse = dashboardAuthErrorResponse(error); if (authResponse) return authResponse; return NextResponse.json({ success: false, error: "Creazione chiave non riuscita" }, { status: 500 }); }
}
