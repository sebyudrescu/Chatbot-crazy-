import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [agents, sources, conversations] = await Promise.all([
      prisma.chatbot.count(),
      prisma.knowledgeSource.count(),
      prisma.conversation.count(),
    ])
    return NextResponse.json({
      success: true,
      data: {
        database: true,
        openAI: Boolean(process.env.OPENAI_API_KEY),
        pinecone: Boolean(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX),
        firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
        accessProtection: Boolean(process.env.APP_ACCESS_PASSWORD),
        environment: process.env.NODE_ENV || 'development',
        counts: { agents, sources, conversations },
      },
    })
  } catch {
    return NextResponse.json({
      success: false,
      data: {
        database: false,
        openAI: Boolean(process.env.OPENAI_API_KEY),
        pinecone: Boolean(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX),
        firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
        accessProtection: Boolean(process.env.APP_ACCESS_PASSWORD),
        environment: process.env.NODE_ENV || 'development',
        counts: { agents: 0, sources: 0, conversations: 0 },
      },
    }, { status: 503 })
  }
}
