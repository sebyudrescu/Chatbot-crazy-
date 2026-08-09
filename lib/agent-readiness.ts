import 'server-only'
import { prisma } from './db'
import { parseJSON } from './utils'
import { latestReadinessDate, productionEvaluationMetricType } from './readiness-metrics'

export type ReadinessCheckKey = 'instructions' | 'knowledge' | 'conversation' | 'evaluations' | 'channel' | 'commerce'

export interface AgentReadinessCheck {
  key: ReadinessCheckKey
  label: string
  description: string
  done: boolean
  href: string
}

export async function getAgentReadiness(botId: string) {
  const agent = await prisma.chatbot.findUnique({
    where: { id: botId },
    include: {
      embedSettings: { select: { enabled: true, allowedDomains: true } },
      knowledgeSources: {
        where: { status: 'completed', chunkCount: { gt: 0 } },
        select: { id: true, createdAt: true, processedAt: true },
        orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      },
      conversations: {
        where: { messages: { some: { role: 'assistant' } } },
        select: {
          id: true,
          messages: {
            where: { role: 'assistant' },
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
      },
      promptVersions: {
        select: { createdAt: true },
        orderBy: { version: 'desc' },
        take: 1,
      },
      evaluationCases: {
        where: { isActive: true },
        select: {
          id: true,
          runs: {
            select: { passed: true, createdAt: true, metrics: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
      integrations: {
        where: {
          enabled: true,
          status: 'connected',
          provider: { in: ['public-page', 'whatsapp', 'instagram'] },
        },
        select: { provider: true },
        take: 1,
      },
      productSources: {
        select: { status: true, lastError: true },
      },
      products: {
        where: { status: 'active', availableForSale: true },
        select: { canonicalUrl: true, mainImageUrl: true },
        take: 50,
      },
    },
  })
  if (!agent) return null

  const settings = parseJSON<Record<string, unknown>>(agent.settings) || {}
  const hasInstructions = Boolean(
    typeof settings.role === 'string' && settings.role.trim() &&
    typeof settings.objective === 'string' && settings.objective.trim() &&
    (agent.systemPrompt?.trim() || agent.promptTemplateId)
  )
  const configurationChangedAt = agent.promptVersions[0]?.createdAt || null
  const knowledgeChangedAt = latestReadinessDate(
    agent.kbLastIndexed,
    ...agent.knowledgeSources.map(source => source.processedAt || source.createdAt),
  )
  const verificationChangedAt = latestReadinessDate(configurationChangedAt, knowledgeChangedAt)
  const latestAssistantAt = agent.conversations[0]?.messages[0]?.createdAt || null
  const conversationPassed = Boolean(
    latestAssistantAt &&
    (!verificationChangedAt || latestAssistantAt >= verificationChangedAt)
  )
  const evaluationMetricTypes = agent.evaluationCases.flatMap(test => {
      const latestRun = test.runs[0]
      if (latestRun?.passed !== true || (verificationChangedAt && latestRun.createdAt < verificationChangedAt)) return []
      const metricType = productionEvaluationMetricType(latestRun.metrics)
      return metricType ? [metricType] : []
    })
  const evaluationsPassed = agent.evaluationCases.length > 0 &&
    evaluationMetricTypes.length === agent.evaluationCases.length &&
    evaluationMetricTypes.includes('grounded') &&
    evaluationMetricTypes.includes('policy')
  const allowedDomains = agent.embedSettings?.allowedDomains
    ?.split(/[\n,]/)
    .map(domain => domain.trim())
    .filter(Boolean) || []
  const secureWidget = agent.embedSettings?.enabled === true &&
    allowedDomains.length > 0 &&
    !allowedDomains.includes('*')
  const connectedChannel = agent.integrations.length > 0
  const commerceConfigured = agent.productSources.length > 0
  const commerceCatalogReady = commerceConfigured &&
    agent.productSources.some(source => source.status === 'active' && !source.lastError) &&
    agent.products.some(product => isPublicHttps(product.canonicalUrl) && isPublicHttps(product.mainImageUrl))

  const checks: AgentReadinessCheck[] = [
    {
      key: 'instructions',
      label: 'Identità e istruzioni',
      description: 'Ruolo, obiettivo, regole e system prompt sono configurati.',
      done: hasInstructions,
      href: `/chatbot/${botId}/settings`,
    },
    {
      key: 'knowledge',
      label: 'Fonti verificate',
      description: 'La knowledge base contiene almeno una fonte ed è pronta.',
      done: agent.kbStatus === 'ready' && agent.kbTotalChunks > 0 && agent.knowledgeSources.length > 0,
      href: `/chatbot/${botId}/knowledge`,
    },
    {
      key: 'conversation',
      label: 'Prova conversazione',
      description: 'È stata ottenuta una risposta completa dopo l’ultimo aggiornamento di istruzioni o fonti.',
      done: conversationPassed,
      href: `/chat/${botId}`,
    },
    {
      key: 'evaluations',
      label: 'Valutazioni automatiche',
      description: 'I controlli recenti includono almeno un caso RAG con faithfulness, accuratezza, Precision@K, Recall@K e MRR, più un caso di sicurezza.',
      done: evaluationsPassed,
      href: `/evaluations?botId=${botId}`,
    },
    {
      key: 'channel',
      label: 'Canale di pubblicazione',
      description: 'È collegato un canale reale oppure il widget è limitato ai domini del cliente.',
      done: secureWidget || connectedChannel,
      href: `/chatbot/${botId}/embed`,
    },
  ]

  if (commerceConfigured) {
    checks.push({
      key: 'commerce',
      label: 'Catalogo e-commerce verificato',
      description: 'La sincronizzazione è sana e almeno un prodotto acquistabile ha URL e immagine ufficiali.',
      done: commerceCatalogReady,
      href: `/commerce?botId=${botId}`,
    })
  }

  const completed = checks.filter(check => check.done).length
  const ready = completed === checks.length
  const status = agent.isActive
    ? ready ? 'published' : 'attention'
    : ready ? 'ready' : 'draft'
  return {
    botId,
    companyName: agent.companyName,
    isActive: agent.isActive,
    ready,
    status,
    attentionRequired: agent.isActive && !ready,
    completed,
    total: checks.length,
    configurationChangedAt,
    knowledgeChangedAt,
    verificationChangedAt,
    checks,
  }
}

function isPublicHttps(value: string | null | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) &&
      url.hostname !== 'localhost' && url.hostname !== '127.0.0.1'
  } catch {
    return false
  }
}
