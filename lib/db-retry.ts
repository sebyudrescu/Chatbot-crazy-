/**
 * Database Retry Logic for SQLite Timeout Issues
 * 
 * SQLite can timeout during concurrent operations.
 * This utility provides automatic retry with exponential backoff.
 */

export async function retryOnTimeout<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: any
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error
      
      // Check if it's a timeout error
      const isTimeout = 
        error.message?.includes('Timed out') ||
        error.message?.includes('timeout') ||
        error.code === 'P2024'
      
      // Don't retry on non-timeout errors
      if (!isTimeout) {
        throw error
      }
      
      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) {
        console.error(`[DB Retry] Failed after ${maxRetries} retries:`, error.message)
        throw error
      }
      
      // Calculate exponential backoff delay
      const delay = baseDelayMs * Math.pow(2, attempt)
      console.log(`[DB Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`)
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}

/**
 * Wrapper for Prisma operations with retry logic
 */
export function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  return retryOnTimeout(operation, 3, 100)
}
