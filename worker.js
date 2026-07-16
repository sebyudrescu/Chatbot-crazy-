/**
 * Standalone Ingestion Worker (CommonJS)
 * 
 * Run: node worker.js
 */

const { startWorker } = require('./lib/ingestion-worker')

console.log('🏭 Chatbot RAG - Async Ingestion Worker')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')

// Start the worker
startWorker(3000)
  .then(() => {
    console.log('✅ Worker started successfully')
  })
  .catch((error) => {
    console.error('❌ Failed to start worker:', error)
    process.exit(1)
  })
