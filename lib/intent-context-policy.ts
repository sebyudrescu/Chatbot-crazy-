import type { IntentType } from './intent-classifier'

export type ConversationTurn = { role: string; content: string }

/**
 * An explicit company-identity question starts a new semantic topic. Carrying
 * an order or product thread into retrieval, coherence checks, or generation
 * can reject authoritative company information as unrelated.
 */
export function conversationHistoryForIntent<T extends ConversationTurn>(
  intent: IntentType,
  history: T[]
): T[] {
  return intent === 'identity_question' ? [] : history
}
