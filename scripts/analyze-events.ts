/**
 * ANALYZE EVENTS
 * 
 * Script per analizzare gli eventi del sistema e identificare pattern/problemi
 */

import { prisma } from '../lib/db'
import { getEvents, getEventStats, getErrorEvents } from '../lib/event-store'

async function analyzeEvents(botId?: string) {
  console.log(`\n📊 EVENT ANALYSIS`)
  console.log(`==========================================\n`)

  // Get overall stats
  const stats = await getEventStats({
    botId,
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
  })

  console.log(`📈 OVERALL STATISTICS (Last 7 days)`)
  console.log(`Total Events: ${stats.totalEvents}`)
  console.log(`Error Events: ${stats.errorEvents}`)
  console.log(`Success Rate: ${stats.successRate.toFixed(1)}%`)
  console.log(``)

  console.log(`📊 BY CATEGORY:`)
  for (const [category, count] of Object.entries(stats.byCategory)) {
    console.log(`   ${category}: ${count}`)
  }
  console.log(``)

  console.log(`🚨 BY SEVERITY:`)
  for (const [severity, count] of Object.entries(stats.bySeverity)) {
    console.log(`   ${severity}: ${count}`)
  }
  console.log(``)

  // Get recent errors
  console.log(`❌ RECENT ERRORS (Last 24 hours):`)
  const recentErrors = await getErrorEvents({
    botId,
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    limit: 10,
  })

  if (recentErrors.length === 0) {
    console.log(`   ✅ No errors in the last 24 hours!`)
  } else {
    for (const error of recentErrors) {
      console.log(`\n   [${error.timestamp.toISOString()}] ${error.eventType}`)
      console.log(`   Bot: ${error.botId || 'system'}`)
      console.log(`   Error: ${error.errorMessage}`)
      if (error.metadata) {
        console.log(`   Metadata:`, error.metadata)
      }
    }
  }

  console.log(`\n`)

  // Analyze ingestion jobs performance
  if (stats.byCategory['ingestion']) {
    console.log(`📦 INGESTION PERFORMANCE:`)
    
    const jobEvents = await prisma.event.findMany({
      where: {
        botId,
        category: 'ingestion',
        eventType: 'ingestion.job.completed',
        timestamp: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    })

    if (jobEvents.length > 0) {
      const avgDuration = jobEvents.reduce((sum, e) => sum + (e.durationMs || 0), 0) / jobEvents.length
      const totalChunks = jobEvents.reduce((sum, e) => {
        const meta = e.metadata ? JSON.parse(e.metadata) : {}
        return sum + (meta.chunksCreated || 0)
      }, 0)

      console.log(`   Completed Jobs: ${jobEvents.length}`)
      console.log(`   Avg Duration: ${(avgDuration / 1000).toFixed(1)}s`)
      console.log(`   Total Chunks Created: ${totalChunks}`)
    }

    console.log(``)
  }

  // Analyze orchestrator performance
  if (stats.byCategory['orchestrator']) {
    console.log(`🧠 ORCHESTRATOR PERFORMANCE:`)
    
    const requestEvents = await prisma.event.findMany({
      where: {
        botId,
        category: 'orchestrator',
        eventType: 'orchestrator.request.completed',
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    })

    if (requestEvents.length > 0) {
      const avgDuration = requestEvents.reduce((sum, e) => sum + (e.durationMs || 0), 0) / requestEvents.length
      
      // Analyze strategies used
      const strategies = new Map<string, number>()
      for (const event of requestEvents) {
        const meta = event.metadata ? JSON.parse(event.metadata) : {}
        const strategy = meta.strategy || 'unknown'
        strategies.set(strategy, (strategies.get(strategy) || 0) + 1)
      }

      console.log(`   Total Requests: ${requestEvents.length}`)
      console.log(`   Avg Response Time: ${avgDuration.toFixed(0)}ms`)
      console.log(`   Strategies Used:`)
      for (const [strategy, count] of strategies.entries()) {
        const percentage = ((count / requestEvents.length) * 100).toFixed(1)
        console.log(`      ${strategy}: ${count} (${percentage}%)`)
      }
    }

    console.log(``)
  }

  // Identify patterns
  console.log(`🔍 PATTERN ANALYSIS:`)
  
  // Check for repeated errors
  const errorsByType = await prisma.event.groupBy({
    by: ['eventType'],
    where: {
      botId,
      success: false,
      timestamp: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    _count: true,
    orderBy: {
      _count: {
        eventType: 'desc',
      },
    },
  })

  if (errorsByType.length > 0) {
    console.log(`   Top Error Types:`)
    for (const error of errorsByType.slice(0, 5)) {
      console.log(`      ${error.eventType}: ${error._count} occurrences`)
    }
  } else {
    console.log(`   ✅ No repeated error patterns detected`)
  }

  console.log(`\n==========================================`)
  console.log(`✅ Analysis complete`)
  console.log(`==========================================\n`)
}

// Run script
const botId = process.argv[2]

analyzeEvents(botId)
  .then(() => {
    console.log(`\n✅ Done!`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })
