export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini'

export const AI_MODEL_CATALOG = [
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini · Consigliato',
    description: 'Rapido ed economico per la maggior parte dei chatbot clienti.',
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    description: 'Più preciso su istruzioni e flussi complessi, con costi contenuti.',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    description: 'Qualità superiore per conversazioni e casi articolati.',
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    description: 'Massima precisione per agenti ad alto valore.',
  },
] as const

export type SupportedAIModel = (typeof AI_MODEL_CATALOG)[number]['id']

const supportedModels = new Set<string>(AI_MODEL_CATALOG.map(model => model.id))

const legacyAliases: Record<string, SupportedAIModel> = {
  'gpt-3.5-turbo': DEFAULT_CHAT_MODEL,
  'gpt-3.5-turbo-0125': DEFAULT_CHAT_MODEL,
  'gpt-4': 'gpt-4o',
}

export function isSupportedAIModel(value: unknown): value is SupportedAIModel {
  return typeof value === 'string' && supportedModels.has(value)
}

export function normalizeAIModel(value?: string | null): SupportedAIModel {
  if (!value) return DEFAULT_CHAT_MODEL
  if (isSupportedAIModel(value)) return value
  return legacyAliases[value.toLowerCase()] || DEFAULT_CHAT_MODEL
}

export function normalizeAgentSettings(settings: unknown): Record<string, unknown> {
  const values = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {}
  return {
    ...values,
    aiModel: normalizeAIModel(typeof values.aiModel === 'string' ? values.aiModel : undefined),
  }
}
