import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dashboardAuthErrorResponse, requireDashboardActor, USER_SESSION_COOKIE } from "@/lib/workspace-auth";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireDashboardActor(request);
    if (actor.kind !== "user" || !actor.sessionId) return NextResponse.json({ success: false, error: "Sessione cliente richiesta" }, { status: 403 });
    const { id } = await context.params;
    const result = await prisma.userSession.updateMany({ where: { id, userId: actor.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) return NextResponse.json({ success: false, error: "Sessione non trovata" }, { status: 404 });
    const response = NextResponse.json({ success: true, current: id === actor.sessionId });
    if (id === actor.sessionId) response.cookies.set(USER_SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0, priority: "high" });
    return response;
  } catch (error) {
    return dashboardAuthErrorResponse(error) || NextResponse.json({ success: false, error: "Revoca non riuscita" }, { status: 500 });
  }
}
