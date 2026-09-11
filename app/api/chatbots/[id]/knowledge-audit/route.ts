import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildKnowledgeAudit } from '@/lib/knowledge-audit';
import { dashboardAuthErrorResponse, requireBotPermission, requireLegacyOwner } from '@/lib/workspace-auth';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const actor = await requireLegacyOwner(request);
    await requireBotPermission(actor, id, 'chatbot.write');
    const sourceId = request.nextUrl.searchParams.get('sourceId');
    if (sourceId) {
      const source = await prisma.knowledgeSource.findFirst({
        where: { id: sourceId, botId: id },
        select: {
          id: true, originalFilename: true, sourceType: true,
          _count: { select: { chunks: true } },
          chunks: { select: { id: true, text: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 5 },
        },
      });
      if (!source) return NextResponse.json({ success: false, error: 'Fonte non trovata' }, { status: 404 });
      return NextResponse.json({ success: true, data: {
        sourceId: source.id, totalChunks: source._count.chunks,
        chunks: source.chunks.map(chunk => ({ id: chunk.id, text: chunk.text.slice(0, 2500), truncated: chunk.text.length > 2500 })),
      } }, { headers: { 'Cache-Control': 'no-store' } });
    }
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
