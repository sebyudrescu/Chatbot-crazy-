import { z } from 'zod'
import { safeHttpsUrl } from './integration-catalog'

export const WorkflowStepSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(['condition', 'collect', 'message', 'webhook', 'handoff', 'tag', 'end']),
  title: z.string().trim().min(1).max(120),
  config: z.record(z.unknown()).default({}),
})

export const WorkflowFieldsSchema = z.object({
  botId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  triggerType: z.enum(['new_message', 'intent', 'keyword', 'manual']).default('new_message'),
  steps: z.array(WorkflowStepSchema).max(50).default([]),
  isActive: z.boolean().default(false),
})

export type WorkflowStepInput = z.infer<typeof WorkflowStepSchema>
export type WorkflowFields = z.infer<typeof WorkflowFieldsSchema>

export function validateWorkflowDefinition(input: Pick<WorkflowFields, 'triggerType' | 'steps' | 'isActive'>) {
  if (!input.isActive) return
  if (!input.steps.length) throw new Error('Aggiungi almeno un passaggio prima di attivare il workflow')

  if (input.triggerType === 'keyword') {
    const condition = input.steps.find(step => step.type === 'condition' && step.config.field === 'message')
    if (!condition || !String(condition.config.value || '').trim()) {
      throw new Error('Un workflow per parola chiave richiede una condizione sul messaggio')
    }
  }
  if (input.triggerType === 'intent') {
    const condition = input.steps.find(step => step.type === 'condition' && step.config.field === 'intent')
    if (!condition || !String(condition.config.value || '').trim()) {
      throw new Error('Un workflow per intento richiede una condizione sul campo intento')
    }
  }

  for (const step of input.steps) {
    if (step.type === 'webhook' && !safeHttpsUrl(String(step.config.url || ''))) {
      throw new Error(`Webhook non valido nel passaggio “${step.title}”`)
    }
    if (step.type === 'webhook' && step.config.secret && String(step.config.secret).length < 16) {
      throw new Error(`Il segreto webhook nel passaggio “${step.title}” deve contenere almeno 16 caratteri`)
    }
    if (step.type === 'message' && !String(step.config.content || '').trim()) {
      throw new Error(`Inserisci il messaggio nel passaggio “${step.title}”`)
    }
    if (step.type === 'tag' && !String(step.config.tag || '').trim()) {
      throw new Error(`Inserisci il tag nel passaggio “${step.title}”`)
    }
  }
}
