/**
 * Standalone Ingestion Worker
 * 
 * Run this separately from Next.js:
 * ts-node worker.ts
 * 
 * Or add to package.json:
 * "worker": "ts-node worker.ts"
 */

import { startWorker } from './lib/ingestion-worker.js'

console.log('🏭 Chatbot RAG - Async Ingestion Worker')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')

// Start the worker
startWorker(3000) // Check for jobs every 3 seconds
  .then(() => {
    console.log('✅ Worker started successfully')
  })
  .catch((error) => {
    console.error('❌ Failed to start worker:', error)
    process.exit(1)
  })
