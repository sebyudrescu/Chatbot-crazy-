import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildKnowledgeAudit } from '@/lib/knowledge-audit';
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, id, 'chatbot.write');
    const [sources, pendingJobs] = await Promise.all([
      prisma.knowledgeSource.findMany({
        where: { botId: id },
        select: { id: true, status: true, sourceType: true, originalFilename: true, processedAt: true, _count: { select: { chunks: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ingestionJob.count({ where: { botId: id, status: { in: ['pending', 'running'] } } }),
    ]);
    return NextResponse.json({ success: true, data: { ...buildKnowledgeAudit(sources, pendingJobs), checkedAt: new Date().toISOString() } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ success: false, error: 'Controllo fonti non disponibile. Riprova.' }, { status: 500 });
  }
}
