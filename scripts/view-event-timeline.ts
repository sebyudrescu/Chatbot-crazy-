/**
 * VIEW EVENT TIMELINE
 * 
 * Script per visualizzare la timeline completa degli eventi
 * Utile per debugging di conversazioni, job, o bot specifici
 */

import { prisma } from '../lib/db'
import { getConversationTimeline, getJobTrace, getEvents } from '../lib/event-store'

async function viewTimeline(type: 'conversation' | 'job' | 'bot', id: string) {
  console.log(`\n📅 EVENT TIMELINE`)
  console.log(`==========================================`)
  console.log(`Type: ${type}`)
  console.log(`ID: ${id}`)
  console.log(`==========================================\n`)

  let events: any[]

  switch (type) {
    case 'conversation':
      events = await getConversationTimeline(id)
      break
    case 'job':
      events = await getJobTrace(id)
      break
    case 'bot':
      events = await getEvents({ botId: id, limit: 200 })
      break
    default:
      throw new Error(`Unknown type: ${type}`)
  }

  if (events.length === 0) {
    console.log(`⚠️ No events found`)
    return
  }

  console.log(`Found ${events.length} events\n`)

  // Group by category for summary
  const byCategory = new Map<string, number>()
  for (const event of events) {
    byCategory.set(event.category, (byCategory.get(event.category) || 0) + 1)
  }

  console.log(`📊 SUMMARY:`)
  for (const [category, count] of byCategory.entries()) {
    console.log(`   ${category}: ${count}`)
  }
  console.log(``)

  // Display timeline
  console.log(`⏱️ TIMELINE:\n`)

  let lastTimestamp = events[0].timestamp.getTime()

  for (const event of events) {
    const timestamp = event.timestamp
    const timeDiff = timestamp.getTime() - lastTimestamp
    lastTimestamp = timestamp.getTime()

    // Format timestamp
    const timeStr = timestamp.toISOString().split('T')[1].split('.')[0]

    // Emoji based on category and severity
    let emoji = '📝'
    if (event.category === 'ingestion') emoji = '📦'
    if (event.category === 'orchestrator') emoji = '🧠'
    if (event.category === 'memory') emoji = '💾'
    if (event.category === 'retrieval') emoji = '🔍'
    if (event.category === 'validation') emoji = '✅'
    if (event.category === 'generation') emoji = '💬'
    if (event.severity === 'error') emoji = '❌'
    if (event.severity === 'warning') emoji = '⚠️'
    if (event.severity === 'critical') emoji = '🚨'

    // Success indicator
    const successIndicator = event.success ? '✓' : '✗'

    // Build event line
    console.log(`[${timeStr}] ${emoji} ${successIndicator} ${event.eventType}`)

    // Show duration if present
    if (event.durationMs) {
      console.log(`         Duration: ${event.durationMs}ms`)
    }

    // Show error message if failed
    if (!event.success && event.errorMessage) {
      console.log(`         Error: ${event.errorMessage}`)
    }

    // Show metadata highlights
    if (event.metadata) {
      const meta = event.metadata
      
      // Show important fields based on event type
      if (event.eventType.includes('job')) {
        if (meta.progress !== undefined) {
          console.log(`         Progress: ${meta.progress}%`)
        }
        if (meta.sourcesCreated) {
          console.log(`         Sources: ${meta.sourcesCreated}, Chunks: ${meta.chunksCreated}`)
        }
      }
      
      if (event.eventType.includes('decision')) {
        console.log(`         Strategy: ${meta.strategy}`)
        console.log(`         Sources: ${meta.sources?.join(', ')}`)
      }
      
      if (event.eventType.includes('retrieval')) {
        if (meta.resultsCount !== undefined) {
          console.log(`         Results: ${meta.resultsCount}`)
        }
        if (meta.topScore !== undefined) {
          console.log(`         Top Score: ${(meta.topScore * 100).toFixed(0)}%`)
        }
      }
      
      if (event.eventType.includes('fact') || event.eventType.includes('entity')) {
        console.log(`         Type: ${meta.factType || meta.entityType}`)
        console.log(`         Confidence: ${(meta.confidence * 100).toFixed(0)}%`)
      }
    }

    // Show time since last event
    if (timeDiff > 1000) {
      console.log(`         (${(timeDiff / 1000).toFixed(1)}s since last event)`)
    }

    console.log(``)
  }

  // Final summary
  const firstEvent = events[0]
  const lastEvent = events[events.length - 1]
  const totalDuration = lastEvent.timestamp.getTime() - firstEvent.timestamp.getTime()

  console.log(`==========================================`)
  console.log(`Duration: ${(totalDuration / 1000).toFixed(1)}s`)
  console.log(`Total Events: ${events.length}`)
  console.log(`Success Rate: ${(events.filter(e => e.success).length / events.length * 100).toFixed(1)}%`)
  console.log(`==========================================\n`)
}

// Run script
const type = process.argv[2] as 'conversation' | 'job' | 'bot'
const id = process.argv[3]

if (!type || !id) {
  console.error(`Usage: npx ts-node scripts/view-event-timeline.ts <type> <id>`)
  console.error(``)
  console.error(`Types:`)
  console.error(`  conversation <conversationId>  - View conversation events`)
  console.error(`  job <jobId>                    - View ingestion job trace`)
  console.error(`  bot <botId>                    - View all bot events`)
  console.error(``)
  process.exit(1)
}

viewTimeline(type, id)
  .then(() => {
    console.log(`\n✅ Done!`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })
