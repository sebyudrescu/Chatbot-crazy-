/**
 * Token Counting Utilities
 * Accurate token counting for context window management
 */

/**
 * Estimate token count for text
 * Rule of thumb: ~4 characters = 1 token for English/Italian
 * More accurate: use tiktoken library (OpenAI's tokenizer)
 */
export function estimateTokenCount(text: string): number {
  // Simple estimation: 4 chars ≈ 1 token
  return Math.ceil(text.length / 4)
}

/**
 * Count tokens in conversation messages
 */
export function countConversationTokens(
  messages: Array<{ role: string; content: string }>
): number {
  let totalTokens = 0

  for (const message of messages) {
    // Message overhead: ~4 tokens per message (role, formatting, etc.)
    totalTokens += 4
    
    // Content tokens
    totalTokens += estimateTokenCount(message.content)
  }

  return totalTokens
}

/**
 * Check if conversation should be summarized based on token count
 */
export function shouldSummarizeByTokens(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 3000 // GPT-3.5 context: 4096, leave room for response
): boolean {
  const tokenCount = countConversationTokens(messages)
  return tokenCount >= maxTokens
}

/**
 * Calculate how many messages to keep vs summarize
 * Returns: { toSummarize: Message[], toKeep: Message[] }
 */
export function splitMessagesForSummarization(
  messages: Array<{ role: string; content: string }>,
  targetTokens: number = 1000 // Target for "working memory"
): {
  toSummarize: Array<{ role: string; content: string }>
  toKeep: Array<{ role: string; content: string }>
} {
  if (messages.length === 0) {
    return { toSummarize: [], toKeep: [] }
  }

  // Work backwards from the end
  const toKeep: Array<{ role: string; content: string }> = []
  let currentTokens = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    const messageTokens = estimateTokenCount(message.content) + 4

    if (currentTokens + messageTokens <= targetTokens) {
      toKeep.unshift(message)
      currentTokens += messageTokens
    } else {
      // Rest goes to summarization
      return {
        toSummarize: messages.slice(0, i + 1),
        toKeep: toKeep,
      }
    }
  }

  // All messages fit in working memory
  return { toSummarize: [], toKeep: messages }
}

/**
 * Format token usage for logging
 */
export function formatTokenUsage(tokenCount: number, maxTokens: number = 4096): string {
  const percentage = Math.round((tokenCount / maxTokens) * 100)
  return `${tokenCount}/${maxTokens} tokens (${percentage}%)`
}

/**
 * Check if we're approaching context limit
 */
export function isApproachingContextLimit(
  tokenCount: number,
  maxTokens: number = 4096,
  warningThreshold: number = 0.75 // 75%
): boolean {
  return tokenCount / maxTokens >= warningThreshold
}
