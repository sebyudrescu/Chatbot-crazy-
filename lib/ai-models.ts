export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini'
export const DEFAULT_AGENTIC_MODEL = 'gpt-5.6-terra'

export const AI_MODEL_CATALOG = [
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna · Economico',
    description: 'Ottimizzato per grandi volumi e costi minimi; ideale per richieste semplici e frequenti.',
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra · Consigliato',
    description: 'Il miglior equilibrio tra qualità, ragionamento e costo per gli agenti dei clienti.',
  },
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol · Massima qualità',
    description: 'Massima capacità per richieste complesse, clienti ad alto valore e casi difficili.',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini · Legacy',
    description: 'Modello compatibile con i flussi precedenti; rapido ed economico.',
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini · Legacy',
    description: 'Compatibilità legacy con buona precisione su istruzioni e flussi complessi.',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o · Legacy',
    description: 'Compatibilità legacy per conversazioni e casi articolati.',
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1 · Legacy',
    description: 'Compatibilità legacy ad alta precisione.',
  },
] as const

export type SupportedAIModel = (typeof AI_MODEL_CATALOG)[number]['id']

const supportedModels = new Set<string>(AI_MODEL_CATALOG.map(model => model.id))

const legacyAliases: Record<string, SupportedAIModel> = {
  'gpt-3.5-turbo': DEFAULT_CHAT_MODEL,
  'gpt-3.5-turbo-0125': DEFAULT_CHAT_MODEL,
  'gpt-4': 'gpt-4o',
  'gpt-5.6': 'gpt-5.6-sol',
}

const legacyChatFallbacks = {
  'gpt-5.6-luna': 'gpt-4o-mini',
  'gpt-5.6-terra': 'gpt-4.1-mini',
  'gpt-5.6-sol': 'gpt-4.1',
} as const satisfies Partial<Record<SupportedAIModel, SupportedAIModel>>

export function isSupportedAIModel(value: unknown): value is SupportedAIModel {
  return typeof value === 'string' && supportedModels.has(value)
}

export function normalizeAIModel(value?: string | null): SupportedAIModel {
  if (!value) return DEFAULT_CHAT_MODEL
  if (isSupportedAIModel(value)) return value
  return legacyAliases[value.toLowerCase()] || DEFAULT_CHAT_MODEL
}

/**
 * Agent settings default to the Responses-based recommended tier. Auxiliary
 * Chat Completions workloads keep using DEFAULT_CHAT_MODEL independently.
 */
export function normalizeAgentAIModel(value?: string | null): SupportedAIModel {
  if (!value) return DEFAULT_AGENTIC_MODEL
  if (isSupportedAIModel(value)) return value
  return legacyAliases[value.toLowerCase()] || DEFAULT_AGENTIC_MODEL
}

/**
 * Legacy Chat Completions paths still send parameters that are not shared by
 * every reasoning-model configuration. Keep those paths on their equivalent
 * proven model tier while the Responses-based agent uses GPT-5.6 directly.
 */
export function normalizeLegacyAIModel(value?: string | null): SupportedAIModel {
  const normalized = normalizeAIModel(value)
  return legacyChatFallbacks[normalized as keyof typeof legacyChatFallbacks] || normalized
}

export function normalizeAgentSettings(settings: unknown): Record<string, unknown> {
  const values = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {}
  return {
    ...values,
    aiModel: normalizeAgentAIModel(typeof values.aiModel === 'string' ? values.aiModel : undefined),
  }
}
