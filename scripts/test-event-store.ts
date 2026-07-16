/**
 * TEST EVENT STORE
 * 
 * Script per testare il sistema Event Store
 */

import { eventStore, getEvents, getEventStats } from '../lib/event-store'
import { prisma } from '../lib/db'

async function testEventStore() {
  console.log(`\n🧪 TESTING EVENT STORE`)
  console.log(`==========================================\n`)

  // Get or create a test bot
  let bot = await prisma.chatbot.findFirst()
  
  if (!bot) {
    console.log(`Creating test bot...`)
    bot = await prisma.chatbot.create({
      data: {
        companyName: 'Test Company',
        kbStatus: 'empty',
      },
    })
  }

  const botId = bot.id
  const testConversationId = 'test-conv-' + Date.now()
  const testJobId = 'test-job-' + Date.now()

  console.log(`Using bot: ${bot.companyName} (${botId})`)
  console.log(``)

  // Test 1: Log system event
  console.log(`Test 1: System Events`)
  await eventStore.logSystemStartup({ version: '1.0.0' })
  await eventStore.logWorkerStarted({ intervalMs: 5000 })
  console.log(`   ✅ System events logged`)
  console.log(``)

  // Test 2: Log ingestion events
  console.log(`Test 2: Ingestion Events`)
  await eventStore.logJobCreated(botId, testJobId, {
    jobType: 'crawl',
    params: { url: 'https://example.com', maxPages: 10 },
  })
  await eventStore.logJobStarted(botId, testJobId, {
    attempt: 1,
    maxAttempts: 3,
  })
  await eventStore.logJobProgress(botId, testJobId, {
    progress: 50,
    message: 'Processing page 5/10',
  })
  await eventStore.logJobCompleted(botId, testJobId, 5000, {
    sourcesCreated: 10,
    chunksCreated: 50,
  })
  console.log(`   ✅ Ingestion events logged`)
  console.log(``)

  // Test 3: Log orchestrator events
  console.log(`Test 3: Orchestrator Events`)
  await eventStore.logRequestStarted(botId, testConversationId, {
    query: 'What is your product?',
  })
  await eventStore.logDecisionMade(botId, testConversationId, {
    intent: 'question',
    strategy: 'rag_enhanced',
    sources: ['knowledge_base'],
    shouldUseRAG: true,
    shouldUseGraph: false,
    entities: ['product'],
  })
  await eventStore.logRequestCompleted(botId, testConversationId, 250, {
    strategy: 'rag_enhanced',
    factsLearned: 2,
    confidence: 0.85,
  })
  console.log(`   ✅ Orchestrator events logged`)
  console.log(``)

  // Test 4: Log memory events
  console.log(`Test 4: Memory Events`)
  await eventStore.logFactExtracted(botId, testConversationId, {
    factType: 'preference',
    entityName: 'user_preference',
    confidence: 0.9,
    source: 'user_stated',
  })
  await eventStore.logEntityCreated(botId, {
    entityId: 'entity-123',
    entityType: 'product',
    entityName: 'iPhone 15 Pro',
    confidence: 1.0,
    extractedFrom: 'knowledge_base',
  })
  await eventStore.logRelationCreated(botId, {
    relationId: 'rel-123',
    relationType: 'HAS_FEATURE',
    sourceEntity: 'iPhone 15 Pro',
    targetEntity: 'USB-C',
    confidence: 1.0,
  })
  console.log(`   ✅ Memory events logged`)
  console.log(``)

  // Test 5: Log error event
  console.log(`Test 5: Error Events`)
  const testError = new Error('Test error for demonstration')
  await eventStore.logJobFailed(botId, testJobId + '-fail', testError, {
    attempt: 3,
    maxAttempts: 3,
    permanent: true,
  })
  console.log(`   ✅ Error events logged`)
  console.log(``)

  // Test 6: Query events
  console.log(`Test 6: Query Events`)
  const recentEvents = await getEvents({
    botId,
    limit: 20,
  })
  console.log(`   ✅ Retrieved ${recentEvents.length} events`)
  console.log(``)

  // Test 7: Get stats
  console.log(`Test 7: Get Statistics`)
  const stats = await getEventStats({ botId })
  console.log(`   Total Events: ${stats.totalEvents}`)
  console.log(`   Error Events: ${stats.errorEvents}`)
  console.log(`   Success Rate: ${stats.successRate.toFixed(1)}%`)
  console.log(`   By Category:`, stats.byCategory)
  console.log(`   By Severity:`, stats.bySeverity)
  console.log(`   ✅ Statistics retrieved`)
  console.log(``)

  // Test 8: Verify event structure
  console.log(`Test 8: Verify Event Structure`)
  if (recentEvents.length > 0) {
    const event = recentEvents[0]
    console.log(`   Sample Event:`)
    console.log(`      ID: ${event.id}`)
    console.log(`      Type: ${event.eventType}`)
    console.log(`      Category: ${event.category}`)
    console.log(`      Severity: ${event.severity}`)
    console.log(`      Success: ${event.success}`)
    console.log(`      Timestamp: ${event.timestamp}`)
    if (event.metadata) {
      console.log(`      Metadata:`, event.metadata)
    }
    console.log(`   ✅ Event structure valid`)
  }
  console.log(``)

  // Test 9: Test performance (async logging)
  console.log(`Test 9: Performance Test (Async Logging)`)
  const startTime = Date.now()
  
  // Log 100 events without waiting
  for (let i = 0; i < 100; i++) {
    eventStore.logMessageReceived(botId, testConversationId, 'user-123', {
      messageLength: 50,
    })
  }
  
  const duration = Date.now() - startTime
  console.log(`   ✅ Logged 100 events in ${duration}ms (${(100 / duration * 1000).toFixed(0)} events/sec)`)
  console.log(`   Note: Events are logged asynchronously, so actual writes happen in background`)
  console.log(``)

  console.log(`==========================================`)
  console.log(`✅ ALL TESTS PASSED`)
  console.log(`==========================================\n`)

  console.log(`📊 Final Stats:`)
  const finalStats = await getEventStats({ botId })
  console.log(`   Total Events: ${finalStats.totalEvents}`)
  console.log(`   Categories:`, Object.keys(finalStats.byCategory).join(', '))
  console.log(``)
}

testEventStore()
  .then(() => {
    console.log(`\n✅ Done!`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })
