import 'server-only'
import { prisma } from './db'
import { safeHttpsUrl } from './integration-catalog'

interface WorkflowStep {
  id: string
  type: 'condition' | 'collect' | 'message' | 'webhook' | 'handoff' | 'tag' | 'end'
  title: string
  config: Record<string, unknown>
}

interface RunContext {
  botId: string
  conversationId: string
  messageId: string
  message: string
  intent?: string
  sentiment?: string
}

export interface WorkflowRunResult {
  executed: string[]
  failed: string[]
  skipped: string[]
  actions: string[]
  responseOverride?: string
}

const parse = <T>(value: string, fallback: T): T => {
  try { return JSON.parse(value) as T } catch { return fallback }
}

const isUniqueConflict = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002'

function matches(value: string, operator: string, expected: string) {
  const actual = value.toLocaleLowerCase('it')
  const target = expected.toLocaleLowerCase('it')
  if (operator === 'equals') return actual === target
  if (operator === 'not_contains') return !actual.includes(target)
  return actual.includes(target)
}

export async function runActiveWorkflows(context: RunContext): Promise<WorkflowRunResult> {
  const workflows = await prisma.workflow.findMany({
    where: { botId: context.botId, isActive: true },
    orderBy: { createdAt: 'asc' },
  })
  const result: WorkflowRunResult = { executed: [], failed: [], skipped: [], actions: [] }

  for (const workflow of workflows) {
    if (workflow.triggerType === 'manual') continue
    const started = Date.now()
    const idempotencyKey = `${workflow.id}:${context.messageId}`
    let executionId = ''

    const existingExecution = await prisma.workflowExecution.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    })
    if (existingExecution) {
      result.skipped.push(workflow.id)
      continue
    }
    try {
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: workflow.id,
          conversationId: context.conversationId,
          messageId: context.messageId,
          idempotencyKey,
          status: 'running',
          trigger: workflow.triggerType,
        },
      })
      executionId = execution.id
    } catch (error) {
      if (isUniqueConflict(error)) {
        result.skipped.push(workflow.id)
        continue
      }
      throw error
    }

    const workflowActions: string[] = []
    try {
      const steps = parse<WorkflowStep[]>(workflow.steps, [])
      if (!steps.length) throw new Error('Workflow senza passaggi validi')
      let allowed = workflow.triggerType === 'new_message'
      let didRun = false

      for (const step of steps) {
        if (step.type === 'condition') {
          const field = String(step.config.field || 'message')
          const source = field === 'intent'
            ? context.intent || ''
            : field === 'sentiment'
              ? context.sentiment || ''
              : context.message
          allowed = matches(source, String(step.config.operator || 'contains'), String(step.config.value || ''))
          if (!allowed) break
          continue
        }
        if (!allowed) break

        if (step.type === 'message') {
          const content = String(step.config.content || '').trim()
          if (content) {
            result.responseOverride = content
            workflowActions.push('message')
            didRun = true
          }
        }
        if (step.type === 'handoff') {
          await prisma.conversation.update({
            where: { id: context.conversationId },
            data: {
              needsHumanEscalation: true,
              escalatedAt: new Date(),
              escalationReason: String(step.config.reason || 'Workflow handoff'),
            },
          })
          workflowActions.push('handoff')
          didRun = true
        }
        if (step.type === 'tag') {
          const conversation = await prisma.conversation.findUnique({
            where: { id: context.conversationId },
            select: { topicsDiscussed: true },
          })
          const current = parse<string[]>(conversation?.topicsDiscussed || '[]', [])
          const tag = String(step.config.tag || '').trim()
          if (tag && !current.includes(tag)) {
            await prisma.conversation.update({
              where: { id: context.conversationId },
              data: { topicsDiscussed: JSON.stringify([...current, tag]) },
            })
          }
          if (tag) {
            workflowActions.push(`tag:${tag}`)
            didRun = true
          }
        }
        if (step.type === 'collect') {
          const field = String(step.config.field || 'email')
          const patterns = {
            email: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
            phone: /(?:\+?\d[\d\s().-]{7,}\d)/,
            name: /(?:mi chiamo|sono)\s+([A-Za-zÀ-ÿ' -]{2,50})/i,
          }
          const match = context.message.match(patterns[field as keyof typeof patterns] || patterns.email)
          if (match) {
            const value = (match[1] || match[0]).trim()
            const data = field === 'phone'
              ? { userPhone: value }
              : field === 'name'
                ? { userName: value }
                : { userEmail: value }
            await prisma.conversation.update({ where: { id: context.conversationId }, data })
            workflowActions.push(`collect:${field}`)
            didRun = true
          }
        }
        if (step.type === 'webhook') {
          const url = safeHttpsUrl(String(step.config.url || ''))
          if (!url) throw new Error('Endpoint webhook non valido')
          const method = String(step.config.method || 'POST').toUpperCase()
          if (method !== 'GET' && method !== 'POST') throw new Error('Metodo webhook non supportato')
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 5000)
          try {
            const response = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: method === 'GET' ? undefined : JSON.stringify(context),
              signal: controller.signal,
            })
            if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`)
          } finally {
            clearTimeout(timer)
          }
          workflowActions.push('webhook')
          didRun = true
        }
        if (step.type === 'end') break
      }

      const status = didRun ? 'success' : 'skipped'
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: { status, actions: JSON.stringify(workflowActions), durationMs: Date.now() - started },
      })
      if (didRun) {
        result.executed.push(workflow.id)
        result.actions.push(...workflowActions)
      } else {
        result.skipped.push(workflow.id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Esecuzione workflow non riuscita'
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'failed',
          actions: JSON.stringify(workflowActions),
          error: message,
          durationMs: Date.now() - started,
        },
      })
      result.failed.push(workflow.id)
    }
  }

  return result
}
