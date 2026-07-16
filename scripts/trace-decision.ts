/**
 * TRACE DECISION CLI
 * 
 * Script per visualizzare la decision trace di un messaggio
 * 
 * Usage:
 *   npx ts-node scripts/trace-decision.ts <messageId>
 *   npx ts-node scripts/trace-decision.ts --conversation <conversationId>
 */

import { buildDecisionTrace, formatTraceForConsole } from '../lib/decision-tracer'
import { prisma } from '../lib/db'

async function traceDecision(messageId: string) {
  console.log(`\n🔍 Fetching decision trace for message: ${messageId}\n`)

  // Get message
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        include: {
          chatbot: true
        }
      }
    }
  })

  if (!message) {
    console.error(`❌ Message not found: ${messageId}`)
    process.exit(1)
  }

  console.log(`Bot: ${message.conversation.chatbot.companyName}`)
  console.log(`Conversation: ${message.conversationId}`)
  console.log(`Message: "${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}"`)
  console.log(``)

  // Build trace
  const trace = await buildDecisionTrace(message.conversationId, messageId)

  if (!trace) {
    console.error(`❌ No trace data available for this message`)
    console.error(`   This may happen if:`)
    console.error(`   - Message was created before event logging was implemented`)
    console.error(`   - Events have been cleaned up`)
    console.error(`   - Message is not an assistant response`)
    process.exit(1)
  }

  // Display trace
  console.log(formatTraceForConsole(trace))

  // Additional analysis
  console.log(`\n📈 QUICK ANALYSIS`)
  console.log(``)

  // Performance analysis
  if (trace.outcome.totalProcessingTime < 500) {
    console.log(`   ✅ Performance: Excellent (${trace.outcome.totalProcessingTime}ms)`)
  } else if (trace.outcome.totalProcessingTime < 1000) {
    console.log(`   ✓  Performance: Good (${trace.outcome.totalProcessingTime}ms)`)
  } else if (trace.outcome.totalProcessingTime < 2000) {
    console.log(`   ⚠️  Performance: Acceptable (${trace.outcome.totalProcessingTime}ms)`)
  } else {
    console.log(`   ❌ Performance: Slow (${trace.outcome.totalProcessingTime}ms)`)
    console.log(`      💡 Consider optimizing retrieval or caching`)
  }

  // Confidence analysis
  if (trace.outcome.overallConfidence > 0.8) {
    console.log(`   ✅ Confidence: High (${(trace.outcome.overallConfidence * 100).toFixed(0)}%)`)
  } else if (trace.outcome.overallConfidence > 0.6) {
    console.log(`   ✓  Confidence: Acceptable (${(trace.outcome.overallConfidence * 100).toFixed(0)}%)`)
  } else {
    console.log(`   ⚠️  Confidence: Low (${(trace.outcome.overallConfidence * 100).toFixed(0)}%)`)
    console.log(`      💡 May need more context or better knowledge base`)
  }

  // Retrieval analysis
  const sourcesUsedCount = trace.retrieval.sourcesUsed.filter(s => s.used).length
  console.log(`   Sources: ${sourcesUsedCount}/4 used`)
  
  if (trace.retrieval.totalResults === 0 && trace.decision.strategy !== 'conversational') {
    console.log(`   ⚠️  No results retrieved - may indicate knowledge gap`)
  }

  // Learning analysis
  if (trace.learning.factsExtracted > 0) {
    console.log(`   📚 Learning: ${trace.learning.factsExtracted} facts, ${trace.learning.entitiesCreated} entities, ${trace.learning.relationsCreated} relations`)
  }

  console.log(``)
}

async function traceConversation(conversationId: string) {
  console.log(`\n🔍 Fetching decision traces for conversation: ${conversationId}\n`)

  // Get conversation
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      chatbot: true,
      messages: {
        where: { role: 'assistant' },
        orderBy: { createdAt: 'asc' }
      }
    }
  })

  if (!conversation) {
    console.error(`❌ Conversation not found: ${conversationId}`)
    process.exit(1)
  }

  console.log(`Bot: ${conversation.chatbot.companyName}`)
  console.log(`Messages: ${conversation.messages.length}`)
  console.log(``)

  if (conversation.messages.length === 0) {
    console.log(`⚠️  No assistant messages in this conversation`)
    process.exit(0)
  }

  // Build traces
  console.log(`Building traces...`)
  const traces = await Promise.all(
    conversation.messages.map(msg => buildDecisionTrace(conversationId, msg.id))
  )

  const validTraces = traces.filter(t => t !== null)

  console.log(`Found ${validTraces.length}/${conversation.messages.length} traces\n`)

  // Display summary
  console.log(`━`.repeat(60))
  console.log(`📊 CONVERSATION TRACE SUMMARY`)
  console.log(`━`.repeat(60))
  console.log(``)

  // Strategy distribution
  const strategyCount = new Map<string, number>()
  for (const trace of validTraces) {
    if (trace) {
      strategyCount.set(trace.decision.strategy, (strategyCount.get(trace.decision.strategy) || 0) + 1)
    }
  }

  console.log(`🎯 Strategies Used:`)
  for (const [strategy, count] of strategyCount.entries()) {
    const percentage = ((count / validTraces.length) * 100).toFixed(0)
    console.log(`   ${strategy}: ${count} (${percentage}%)`)
  }
  console.log(``)

  // Performance stats
  const avgTime = validTraces.reduce((sum, t) => sum + (t?.outcome.totalProcessingTime || 0), 0) / validTraces.length
  const avgConfidence = validTraces.reduce((sum, t) => sum + (t?.outcome.overallConfidence || 0), 0) / validTraces.length

  console.log(`⚡ Performance:`)
  console.log(`   Avg response time: ${avgTime.toFixed(0)}ms`)
  console.log(`   Avg confidence: ${(avgConfidence * 100).toFixed(0)}%`)
  console.log(``)

  // Learning stats
  const totalFacts = validTraces.reduce((sum, t) => sum + (t?.learning.factsExtracted || 0), 0)
  const totalEntities = validTraces.reduce((sum, t) => sum + (t?.learning.entitiesCreated || 0), 0)
  const totalRelations = validTraces.reduce((sum, t) => sum + (t?.learning.relationsCreated || 0), 0)

  console.log(`📚 Learning:`)
  console.log(`   Total facts extracted: ${totalFacts}`)
  console.log(`   Total entities created: ${totalEntities}`)
  console.log(`   Total relations created: ${totalRelations}`)
  console.log(``)

  // Issues summary
  const allIssues = validTraces.flatMap(t => t?.issues || [])
  const issuesBySeverity = new Map<string, number>()
  for (const issue of allIssues) {
    issuesBySeverity.set(issue.severity, (issuesBySeverity.get(issue.severity) || 0) + 1)
  }

  if (allIssues.length > 0) {
    console.log(`⚠️  Issues:`)
    for (const [severity, count] of issuesBySeverity.entries()) {
      const icon = severity === 'error' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️'
      console.log(`   ${icon} ${severity}: ${count}`)
    }
    console.log(``)
  }

  console.log(`━`.repeat(60))
  console.log(``)

  // Ask if want to see individual traces
  console.log(`💡 To see individual message traces, run:`)
  for (const msg of conversation.messages.slice(0, 3)) {
    console.log(`   npx ts-node scripts/trace-decision.ts ${msg.id}`)
  }
  if (conversation.messages.length > 3) {
    console.log(`   ... and ${conversation.messages.length - 3} more`)
  }
  console.log(``)
}

// Main
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error(`Usage:`)
    console.error(`  npx ts-node scripts/trace-decision.ts <messageId>`)
    console.error(`  npx ts-node scripts/trace-decision.ts --conversation <conversationId>`)
    console.error(``)
    console.error(`Examples:`)
    console.error(`  npx ts-node scripts/trace-decision.ts msg-123`)
    console.error(`  npx ts-node scripts/trace-decision.ts --conversation conv-456`)
    process.exit(1)
  }

  if (args[0] === '--conversation' || args[0] === '-c') {
    if (args.length < 2) {
      console.error(`❌ Missing conversation ID`)
      process.exit(1)
    }
    await traceConversation(args[1])
  } else {
    await traceDecision(args[0])
  }
}

main()
  .then(() => {
    console.log(`\n✅ Done!\n`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })
