import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dashboardAuthErrorResponse, requireDashboardActor } from "@/lib/workspace-auth";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    if (actor.kind !== "user" || !actor.sessionId) return NextResponse.json({ success: false, error: "Sessione cliente richiesta" }, { status: 403 });
    const sessions = await prisma.userSession.findMany({
      where: { userId: actor.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true, deviceLabel: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    return NextResponse.json({ success: true, data: sessions.map(session => ({ ...session, current: session.id === actor.sessionId })) });
  } catch (error) {
    return dashboardAuthErrorResponse(error) || NextResponse.json({ success: false, error: "Sessioni non disponibili" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    if (actor.kind !== "user" || !actor.sessionId) return NextResponse.json({ success: false, error: "Sessione cliente richiesta" }, { status: 403 });
    await prisma.userSession.updateMany({ where: { userId: actor.userId, id: { not: actor.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return dashboardAuthErrorResponse(error) || NextResponse.json({ success: false, error: "Revoca non riuscita" }, { status: 500 });
  }
}
