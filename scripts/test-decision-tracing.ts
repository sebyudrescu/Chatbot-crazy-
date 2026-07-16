/**
 * TEST DECISION TRACING
 * 
 * Script per testare il sistema di decision tracing
 */

import { prisma } from '../lib/db'
import { buildDecisionTrace, formatTraceForConsole } from '../lib/decision-tracer'

async function testDecisionTracing() {
  console.log(`\n🧪 TESTING DECISION TRACING`)
  console.log(`==========================================\n`)

  // Find a recent conversation with messages
  console.log(`1. Finding test conversation...`)
  
  const conversation = await prisma.conversation.findFirst({
    include: {
      messages: {
        where: { role: 'assistant' },
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      chatbot: true
    },
    orderBy: { startedAt: 'desc' }
  })

  if (!conversation || conversation.messages.length === 0) {
    console.log(`   ⚠️  No conversations with assistant messages found`)
    console.log(`   Create a test conversation first by chatting with a bot`)
    return
  }

  const message = conversation.messages[0]
  
  console.log(`   ✅ Found conversation: ${conversation.id}`)
  console.log(`   Bot: ${conversation.chatbot.companyName}`)
  console.log(`   Message: "${message.content.substring(0, 50)}..."`)
  console.log(``)

  // Test 1: Build decision trace
  console.log(`2. Building decision trace...`)
  
  const trace = await buildDecisionTrace(conversation.id, message.id)
  
  if (!trace) {
    console.log(`   ⚠️  No trace available (events may not be logged yet)`)
    console.log(`   This is normal for older messages`)
    return
  }

  console.log(`   ✅ Trace built successfully`)
  console.log(``)

  // Test 2: Verify trace structure
  console.log(`3. Verifying trace structure...`)
  
  const checks = [
    { name: 'Has messageId', pass: !!trace.messageId },
    { name: 'Has conversationId', pass: !!trace.conversationId },
    { name: 'Has query', pass: !!trace.query },
    { name: 'Has understanding', pass: !!trace.understanding },
    { name: 'Has decision', pass: !!trace.decision },
    { name: 'Has retrieval', pass: !!trace.retrieval },
    { name: 'Has generation', pass: !!trace.generation },
    { name: 'Has outcome', pass: !!trace.outcome },
    { name: 'Decision has strategy', pass: !!trace.decision.strategy },
    { name: 'Decision has why', pass: !!trace.decision.why },
    { name: 'Retrieval has sources', pass: trace.retrieval.sourcesUsed.length > 0 },
  ]

  let allPassed = true
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌'
    console.log(`   ${icon} ${check.name}`)
    if (!check.pass) allPassed = false
  }
  console.log(``)

  if (!allPassed) {
    console.log(`   ⚠️  Some checks failed - trace structure may be incomplete`)
    console.log(``)
  }

  // Test 3: Format for console
  console.log(`4. Testing console formatting...`)
  
  const formatted = formatTraceForConsole(trace)
  console.log(`   ✅ Formatted successfully (${formatted.split('\n').length} lines)`)
  console.log(``)

  // Test 4: Display trace
  console.log(`5. Displaying formatted trace...`)
  console.log(``)
  console.log(formatted)

  // Test 5: Verify insights
  console.log(`\n6. Analyzing trace insights...`)
  console.log(``)
  
  console.log(`   Strategy: ${trace.decision.strategy}`)
  console.log(`   Confidence: ${(trace.outcome.overallConfidence * 100).toFixed(0)}%`)
  console.log(`   Processing time: ${trace.outcome.totalProcessingTime}ms`)
  
  const sourcesUsed = trace.retrieval.sourcesUsed.filter(s => s.used)
  console.log(`   Sources used: ${sourcesUsed.map(s => s.source).join(', ')}`)
  
  if (trace.issues.length > 0) {
    console.log(`   Issues: ${trace.issues.length}`)
  } else {
    console.log(`   Issues: None`)
  }
  console.log(``)

  // Summary
  console.log(`==========================================`)
  console.log(`✅ DECISION TRACING TEST COMPLETE`)
  console.log(`==========================================`)
  console.log(``)
  console.log(`📊 Summary:`)
  console.log(`   - Trace structure: ${allPassed ? 'Valid' : 'Incomplete'}`)
  console.log(`   - Formatting: Working`)
  console.log(`   - Insights: Available`)
  console.log(``)
  console.log(`💡 Next steps:`)
  console.log(`   - Try: npx ts-node scripts/trace-decision.ts ${message.id}`)
  console.log(`   - Try: npx ts-node scripts/trace-decision.ts --conversation ${conversation.id}`)
  console.log(`   - Try: curl http://localhost:3000/api/decisions/${message.id}/trace`)
  console.log(``)
}

testDecisionTracing()
  .then(() => {
    console.log(`✅ Done!\n`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })
