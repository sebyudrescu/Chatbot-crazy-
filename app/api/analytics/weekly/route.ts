import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildWeeklyReport } from '@/lib/weekly-report';
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    const botId = request.nextUrl.searchParams.get('botId');
    if (!botId) return NextResponse.json({ success: false, error: 'Seleziona un chatbot' }, { status: 400 });
    await requireBotPermission(actor, botId, 'analytics.read');
    const now = new Date();
    const rows = await prisma.conversation.findMany({
      where: { botId, startedAt: { gte: new Date(now.getTime() - 14 * 86400000), lt: now } },
      select: { id: true, startedAt: true, userSessionId: true, topicsDiscussed: true, needsHumanEscalation: true, isResolved: true },
      take: 5001, orderBy: { startedAt: 'desc' },
    });
    if (rows.length > 5000) return NextResponse.json({ success: false, error: 'Il volume supera il limite del report. Nessun riepilogo parziale viene mostrato.' }, { status: 422 });
    return NextResponse.json({ success: true, data: buildWeeklyReport(rows, now) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return dashboardAuthErrorResponse(error) || NextResponse.json({ success: false, error: 'Report non disponibile. Riprova.' }, { status: 500 });
  }
}
