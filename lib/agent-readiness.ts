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
      knowledgeSources: { select: { id: true }, take: 1 },
      conversations: { select: { id: true }, take: 1 },
      evaluationCases: {
        where: { isActive: true },
        select: {
          id: true,
          runs: { select: { passed: true }, orderBy: { createdAt: 'desc' }, take: 1 },
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
  const evaluationsPassed = agent.evaluationCases.length > 0 &&
    agent.evaluationCases.every(test => test.runs[0]?.passed === true)

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
      description: 'È stata completata almeno una conversazione privata di prova.',
      done: agent.conversations.length > 0,
      href: `/chat/${botId}`,
    },
    {
      key: 'evaluations',
      label: 'Valutazioni automatiche',
      description: 'Tutti i controlli attivi hanno un ultimo risultato positivo.',
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
    checks,
  }
}
