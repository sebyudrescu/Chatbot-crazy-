import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { normalizeDocumentText } from '@/lib/document-processors'
import { processAndStoreDocument } from '@/lib/rag-pipeline'
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

const Schema = z.object({ botId: z.string().uuid(), title: z.string().trim().min(2).max(160), content: z.string().min(50).max(500000), previewOnly: z.boolean().default(false) })
export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request)
    const input = Schema.parse(await request.json()), text = normalizeDocumentText(input.content)
    await requireBotPermission(actor, input.botId, 'chatbot.write')
    const stats = { title: input.title, type: 'manual', characters: text.length, words: text.split(/\s+/).length, preview: text.slice(0, 8000), truncated: text.length > 8000, warnings: text.length < 300 ? ['Contenuto molto breve: valuta di aggiungere dettagli o FAQ.'] : [] }
    if (input.previewOnly) return NextResponse.json({ success: true, data: stats })
    const source = await prisma.knowledgeSource.create({ data: { botId: input.botId, sourceType: 'manual', originalFilename: input.title, contentText: text, status: 'processing' } })
    const processed = await processAndStoreDocument(input.botId, source.id, 'manual', text)
    if (!processed.success) return NextResponse.json({ success: false, error: processed.error, sourceId: source.id }, { status: 500 })
    return NextResponse.json({ success: true, data: { ...stats, sourceId: source.id, status: 'completed', chunks: processed.chunkCount } }, { status: 201 })
  } catch (error) { const authResponse = dashboardAuthErrorResponse(error); if (authResponse) return authResponse; return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Contenuto non valido' }, { status: 400 }) }
}
