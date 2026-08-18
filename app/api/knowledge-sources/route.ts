import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { CreateKnowledgeSourceSchema, SourceStatus } from '@/lib/types'
import { processAndStoreDocument } from '@/lib/rag-pipeline'

// GET /api/knowledge-sources - List knowledge sources
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const botId = searchParams.get('botId')
    const status = searchParams.get('status')
    
    const sources = await prisma.knowledgeSource.findMany({
      where: {
        ...(botId && { botId }),
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
    })
    
    return NextResponse.json({
      success: true,
      data: sources,
    })
  } catch (error) {
    console.error('Error fetching knowledge sources:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch knowledge sources' },
      { status: 500 }
    )
  }
}

// DELETE /api/knowledge-sources?sourceId=xxx&botId=xxx - Delete a knowledge source
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const sourceId = searchParams.get('sourceId')
    const botId = searchParams.get('botId')
    
    if (!sourceId || !botId) {
      return NextResponse.json(
        { success: false, error: 'sourceId and botId are required' },
        { status: 400 }
      )
    }
    
    const source = await prisma.knowledgeSource.findFirst({ where: { id: sourceId, botId } })
    if (!source) {
      return NextResponse.json({ success: false, error: 'Knowledge source not found' }, { status: 404 })
    }
    if (source.sourceType === 'qa') {
      return NextResponse.json(
        { success: false, error: 'Le Q&A verificate vanno archiviate dai Chat Logs per mantenere allineati test, versioni e audit.' },
        { status: 409 },
      )
    }

    // Remove vectors before deleting the source record so retrieval cannot use stale data.
    const { deleteDatabaseVectorsForSource } = await import('@/lib/database-vector-store')
    await deleteDatabaseVectorsForSource(botId, sourceId)
    const { deleteVectorsForSource, isPineconeConfigured } = await import('@/lib/pinecone-vector-store')
    if (isPineconeConfigured()) await deleteVectorsForSource(botId, sourceId)

    await prisma.knowledgeSource.delete({
      where: { id: sourceId },
    })

    const remaining = await prisma.knowledgeSource.aggregate({
      where: { botId, status: SourceStatus.COMPLETED },
      _sum: { chunkCount: true },
      _count: true,
    })
    await prisma.chatbot.update({
      where: { id: botId },
      data: {
        kbTotalChunks: remaining._sum.chunkCount || 0,
        kbStatus: remaining._count > 0 ? 'ready' : 'empty',
        kbLastIndexed: remaining._count > 0 ? new Date() : null,
      },
    })
    
    return NextResponse.json({
      success: true,
      message: 'Knowledge source deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting knowledge source:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete knowledge source' },
      { status: 500 }
    )
  }
}

// POST /api/knowledge-sources - Create a knowledge source
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = CreateKnowledgeSourceSchema.parse(body)
    const bot = await prisma.chatbot.findUnique({
      where: { id: validatedData.botId },
      select: { id: true },
    })
    if (!bot) {
      return NextResponse.json(
        { success: false, error: 'Agente non trovato' },
        { status: 404 },
      )
    }
    if (validatedData.contentText.trim().length < 50) {
      return NextResponse.json(
        { success: false, error: 'La fonte deve contenere almeno 50 caratteri' },
        { status: 400 },
      )
    }
    
    const source = await prisma.knowledgeSource.create({
      data: {
        botId: validatedData.botId,
        sourceType: validatedData.sourceType,
        sourceUrl: validatedData.sourceUrl,
        originalFilename: validatedData.originalFilename,
        contentText: validatedData.contentText,
        status: SourceStatus.PROCESSING,
      },
    })
    
    const processed = await processAndStoreDocument(
      validatedData.botId,
      source.id,
      validatedData.sourceType,
      validatedData.contentText,
    )
    if (!processed.success) {
      return NextResponse.json(
        { success: false, error: processed.error, sourceId: source.id },
        { status: 500 },
      )
    }
    
    return NextResponse.json(
      {
        success: true,
        data: {
          ...source,
          status: SourceStatus.COMPLETED,
          chunkCount: processed.chunkCount,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating knowledge source:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create knowledge source',
      },
      { status: 400 }
    )
  }
}
