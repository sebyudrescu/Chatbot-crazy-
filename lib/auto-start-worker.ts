/**
 * Auto-start worker when Next.js server starts
 * 
 * Import this in a server component or API route
 */

let workerStarted = false

export async function ensureWorkerStarted() {
  if (workerStarted) {
    return
  }

  if (typeof window !== 'undefined') {
    // Client-side, skip
    return
  }

  try {
    const { startWorker } = await import('./ingestion-worker')
    
    console.log('[AutoStart] 🏭 Starting background worker...')
    await startWorker(3000)
    workerStarted = true
    console.log('[AutoStart] ✅ Background worker started')
    
  } catch (error) {
    console.error('[AutoStart] ❌ Failed to start worker:', error)
  }
}
