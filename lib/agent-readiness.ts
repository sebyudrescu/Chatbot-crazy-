import 'server-only'
import { prisma } from './db'
import { parseJSON } from './utils'

export type ReadinessCheckKey = 'instructions' | 'knowledge' | 'conversation' | 'evaluations' | 'channel'

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
      embedSettings: { select: { enabled: true } },
      knowledgeSources: {
        where: { status: 'completed', chunkCount: { gt: 0 } },
        select: { id: true },
        take: 1,
      },
      conversations: {
        where: { messages: { some: { role: 'assistant' } } },
        select: { id: true },
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
            select: { passed: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
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
  const evaluationsPassed = agent.evaluationCases.length > 0 &&
    agent.evaluationCases.every(test => {
      const latestRun = test.runs[0]
      return latestRun?.passed === true &&
        (!configurationChangedAt || latestRun.createdAt >= configurationChangedAt)
    })

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
      description: 'È stata ottenuta almeno una risposta completa in una conversazione di prova.',
      done: agent.conversations.length > 0,
      href: `/chat/${botId}`,
    },
    {
      key: 'evaluations',
      label: 'Valutazioni automatiche',
      description: 'Tutti i controlli attivi sono stati superati dopo l’ultima modifica alle istruzioni.',
      done: evaluationsPassed,
      href: `/evaluations?botId=${botId}`,
    },
    {
      key: 'channel',
      label: 'Widget e pubblicazione',
      description: 'Il widget è configurato e abilitato per il sito del cliente.',
      done: agent.embedSettings?.enabled === true,
      href: `/chatbot/${botId}/embed`,
    },
  ]

  const completed = checks.filter(check => check.done).length
  return {
    botId,
    companyName: agent.companyName,
    isActive: agent.isActive,
    ready: completed === checks.length,
    completed,
    total: checks.length,
    configurationChangedAt,
    checks,
  }
}
