/**
 * WEEKLY REPORT
 * 
 * Genera report analytics settimanale del sistema
 * 
 * Usage:
 *   npx ts-node scripts/weekly-report.ts
 *   npx ts-node scripts/weekly-report.ts --days 7
 *   npx ts-node scripts/weekly-report.ts --bot <botId>
 */

import { prisma } from '../lib/db'
import { getEventStats } from '../lib/event-store'

async function generateWeeklyReport(botId?: string, days: number = 7) {
  console.log(`\n📊 WEEKLY ANALYTICS REPORT`)
  console.log(`==========================================`)
  console.log(`Period: Last ${days} days`)
  if (botId) console.log(`Bot: ${botId}`)
  console.log(`==========================================\n`)

  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Get bots
  const bots = botId 
    ? [await prisma.chatbot.findUnique({ where: { id: botId } })]
    : await prisma.chatbot.findMany({ where: { isActive: true } })

  const validBots = bots.filter(b => b !== null)

  if (validBots.length === 0) {
    console.log('⚠️  No bots found')
    return
  }

  for (const bot of validBots) {
    if (!bot) continue

    console.log(`\n${'═'.repeat(60)}`)
    console.log(`🤖 ${bot.companyName} (${bot.id})`)
    console.log(`${'═'.repeat(60)}\n`)

    // 1. Overall Stats
    const stats = await getEventStats({
      botId: bot.id,
      startDate
    })

    console.log(`📈 OVERALL STATISTICS`)
    console.log(``)
    console.log(`   Total Events: ${stats.totalEvents}`)
    console.log(`   Error Events: ${stats.errorEvents}`)
    console.log(`   Success Rate: ${stats.successRate.toFixed(1)}%`)
    console.log(``)

    // 2. Conversations
    const totalConvs = await prisma.conversation.count({
      where: {
        botId: bot.id,
        startedAt: { gte: startDate }
      }
    })

    const totalMessages = await prisma.message.count({
      where: {
        conversation: {
          botId: bot.id,
          startedAt: { gte: startDate }
        }
      }
    })

    const userMessages = await prisma.message.count({
      where: {
        role: 'user',
        conversation: {
          botId: bot.id,
          startedAt: { gte: startDate }
        }
      }
    })

    console.log(`💬 CONVERSATIONS`)
    console.log(``)
    console.log(`   Total Conversations: ${totalConvs}`)
    console.log(`   Total Messages: ${totalMessages}`)
    console.log(`   User Messages: ${userMessages}`)
    console.log(`   Avg Messages/Conversation: ${totalConvs > 0 ? (totalMessages / totalConvs).toFixed(1) : 0}`)
    console.log(``)

    // 3. Strategy Performance
    const requestEvents = await prisma.event.findMany({
      where: {
        botId: bot.id,
        eventType: 'orchestrator.request.completed',
        timestamp: { gte: startDate }
      }
    })

    if (requestEvents.length > 0) {
      console.log(`🎯 STRATEGY PERFORMANCE`)
      console.log(``)

      const strategies = new Map<string, {
        count: number
        totalTime: number
        totalConfidence: number
      }>()

      for (const event of requestEvents) {
        const meta = event.metadata ? JSON.parse(event.metadata) : {}
        const strategy = meta.strategy || 'unknown'
        
        if (!strategies.has(strategy)) {
          strategies.set(strategy, { count: 0, totalTime: 0, totalConfidence: 0 })
        }
        
        const data = strategies.get(strategy)!
        data.count++
        data.totalTime += event.durationMs || 0
        data.totalConfidence += meta.confidence || 0
      }

      for (const [strategy, data] of strategies.entries()) {
        const avgTime = data.totalTime / data.count
        const avgConfidence = data.totalConfidence / data.count
        const percentage = ((data.count / requestEvents.length) * 100).toFixed(1)

        console.log(`   ${strategy}:`)
        console.log(`      Usage: ${data.count} (${percentage}%)`)
        console.log(`      Avg Time: ${avgTime.toFixed(0)}ms`)
        console.log(`      Avg Confidence: ${(avgConfidence * 100).toFixed(0)}%`)
        console.log(``)
      }
    }

    // 4. Knowledge Base Stats
    const kbSources = await prisma.knowledgeSource.count({
      where: { botId: bot.id, status: 'completed' }
    })

    const totalChunks = bot.kbTotalChunks

    console.log(`📚 KNOWLEDGE BASE`)
    console.log(``)
    console.log(`   Status: ${bot.kbStatus}`)
    console.log(`   Sources: ${kbSources}`)
    console.log(`   Total Chunks: ${totalChunks}`)
    console.log(`   Last Indexed: ${bot.kbLastIndexed ? bot.kbLastIndexed.toLocaleDateString() : 'Never'}`)
    console.log(``)

    // 5. Memory Stats
    const totalFacts = await prisma.structuredFact.count({
      where: {
        botId: bot.id,
        isActive: true
      }
    })

    const recentFacts = await prisma.structuredFact.count({
      where: {
        botId: bot.id,
        isActive: true,
        extractedAt: { gte: startDate }
      }
    })

    const totalEntities = await prisma.entity.count({
      where: {
        botId: bot.id,
        isActive: true
      }
    })

    const totalRelations = await prisma.relation.count({
      where: {
        botId: bot.id,
        isActive: true
      }
    })

    console.log(`🧠 MEMORY & KNOWLEDGE GRAPH`)
    console.log(``)
    console.log(`   Total Facts: ${totalFacts}`)
    console.log(`   Facts This Week: ${recentFacts}`)
    console.log(`   Entities: ${totalEntities}`)
    console.log(`   Relations: ${totalRelations}`)
    console.log(``)

    // 6. Issues Summary
    const errorEvents = await prisma.event.findMany({
      where: {
        botId: bot.id,
        success: false,
        timestamp: { gte: startDate }
      },
      orderBy: { timestamp: 'desc' },
      take: 10
    })

    if (errorEvents.length > 0) {
      console.log(`⚠️  RECENT ISSUES (Last 10)`)
      console.log(``)

      const errorsByType = new Map<string, number>()
      for (const event of errorEvents) {
        errorsByType.set(event.eventType, (errorsByType.get(event.eventType) || 0) + 1)
      }

      for (const [type, count] of errorsByType.entries()) {
        console.log(`   ${type}: ${count}`)
      }
      console.log(``)
    }

    // 7. Top Recommendations
    console.log(`💡 RECOMMENDATIONS`)
    console.log(``)

    const recommendations: string[] = []

    if (stats.successRate < 90) {
      recommendations.push(`❌ Success rate below 90% - investigate and fix recurring errors`)
    }

    if (requestEvents.length > 0) {
      const avgConfidence = requestEvents.reduce((sum, e) => {
        const meta = e.metadata ? JSON.parse(e.metadata) : {}
        return sum + (meta.confidence || 0)
      }, 0) / requestEvents.length

      if (avgConfidence < 0.7) {
        recommendations.push(`⚠️  Average confidence below 70% - improve knowledge base coverage`)
      }
    }

    if (kbSources === 0) {
      recommendations.push(`📚 No knowledge sources - add documentation to enable RAG`)
    }

    if (totalFacts < 10 && totalConvs > 10) {
      recommendations.push(`🧠 Low fact extraction rate - review memory extraction logic`)
    }

    if (errorEvents.length > requestEvents.length * 0.1) {
      recommendations.push(`🚨 High error rate - review logs and fix issues`)
    }

    if (recommendations.length === 0) {
      console.log(`   ✅ System performing well, no critical issues`)
    } else {
      for (const rec of recommendations) {
        console.log(`   ${rec}`)
      }
    }
    console.log(``)
  }

  // Overall Summary
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`📊 SUMMARY`)
  console.log(`${'═'.repeat(60)}\n`)

  const totalEvents = await prisma.event.count({
    where: {
      timestamp: { gte: startDate },
      ...(botId ? { botId } : {})
    }
  })

  const totalConversations = await prisma.conversation.count({
    where: {
      startedAt: { gte: startDate },
      ...(botId ? { botId } : {})
    }
  })

  console.log(`   Active Bots: ${validBots.length}`)
  console.log(`   Total Events: ${totalEvents}`)
  console.log(`   Total Conversations: ${totalConversations}`)
  console.log(`   Events/Day: ${(totalEvents / days).toFixed(0)}`)
  console.log(`   Conversations/Day: ${(totalConversations / days).toFixed(0)}`)
  console.log(``)

  console.log(`==========================================`)
  console.log(`Report generated: ${new Date().toLocaleString()}`)
  console.log(`==========================================\n`)
}

// Main
async function main() {
  const args = process.argv.slice(2)
  
  let botId: string | undefined
  let days = 7

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--bot' && i + 1 < args.length) {
      botId = args[i + 1]
    }
    if (args[i] === '--days' && i + 1 < args.length) {
      days = parseInt(args[i + 1])
    }
  }

  await generateWeeklyReport(botId, days)
}

main()
  .then(() => {
    console.log(`✅ Done!\n`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })
