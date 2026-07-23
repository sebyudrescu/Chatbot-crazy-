import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOperationalHealth } from '@/lib/operational-health'
import { getDeploymentReadiness } from '@/lib/deployment-readiness'

export const dynamic = 'force-dynamic'

async function verifyOpenAIKey() {
  const key = process.env.OPENAI_API_KEY
  if (!key) return false
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function GET() {
  try {
    const [agents, sources, conversations, operations, openAI] = await Promise.all([
      prisma.chatbot.count(),
      prisma.knowledgeSource.count(),
      prisma.conversation.count(),
      getOperationalHealth(),
      verifyOpenAIKey(),
    ])
    const deployment = getDeploymentReadiness()
    return NextResponse.json({
      success: true,
      data: {
        database: true,
        openAI,
        openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
        pinecone: Boolean(process.env.PINECONE_API_KEY && (process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX)),
        firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
        accessProtection: Boolean(process.env.APP_ACCESS_PASSWORD),
        environment: process.env.NODE_ENV || 'development',
        counts: { agents, sources, conversations },
        operations,
        deployment,
      },
    })
  } catch {
    return NextResponse.json({
      success: false,
      data: {
        database: false,
        openAI: false,
        openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
        pinecone: Boolean(process.env.PINECONE_API_KEY && (process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX)),
        firecrawl: Boolean(process.env.FIRECRAWL_API_KEY),
        accessProtection: Boolean(process.env.APP_ACCESS_PASSWORD),
        environment: process.env.NODE_ENV || 'development',
        counts: { agents: 0, sources: 0, conversations: 0 },
        operations: null,
        deployment: getDeploymentReadiness(),
      },
    }, { status: 503 })
  }
}
