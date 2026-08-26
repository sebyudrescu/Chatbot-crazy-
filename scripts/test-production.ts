/**
 * TEST PRODUCTION
 * 
 * Script completo per testare il sistema in produzione
 * Include: bot creation, KB upload, chat test, trace visualization
 */

import { prisma } from '../lib/db'
import { createIngestionJob } from '../lib/ingestion-queue'
import { buildDecisionTrace, formatTraceForConsole } from '../lib/decision-tracer'

async function testProduction() {
  console.log(`\n🚀 PRODUCTION TEST`)
  console.log(`==========================================\n`)

  // Step 1: Get or create test bot
  console.log(`Step 1: Setting up test bot...`)
  
  let bot = await prisma.chatbot.findFirst({
    where: { companyName: 'Test Company' }
  })

  if (!bot) {
    bot = await prisma.chatbot.create({
      data: {
        workspaceId: '00000000-0000-4000-8000-000000000001',
        companyName: 'Test Company',
        kbStatus: 'empty',
        promptTemplateId: 'customer-support'
      }
    })
    console.log(`   ✅ Created new bot: ${bot.id}`)
  } else {
    console.log(`   ✅ Using existing bot: ${bot.id}`)
  }
  console.log(``)

  // Step 2: Check if KB exists
  console.log(`Step 2: Checking knowledge base...`)
  
  const kbSources = await prisma.knowledgeSource.count({
    where: { botId: bot.id, status: 'completed' }
  })

  console.log(`   Knowledge sources: ${kbSources}`)
  
  if (kbSources === 0) {
    console.log(`   ℹ️  No KB yet - add some via web UI or API`)
    console.log(`   ℹ️  Go to: http://localhost:3000/chatbot/${bot.id}/setup`)
  } else {
    console.log(`   ✅ KB ready with ${kbSources} sources`)
  }
  console.log(``)

  // Step 3: Create test conversation
  console.log(`Step 3: Creating test conversation...`)
  
  const conversation = await prisma.conversation.create({
    data: {
      botId: bot.id,
      userSessionId: 'test-session-' + Date.now()
    }
  })
  console.log(`   ✅ Created conversation: ${conversation.id}`)
  console.log(``)

  // Step 4: Simulate user messages
  console.log(`Step 4: Simulating conversation...`)
  
  const testMessages = [
    "Hello! Can you help me?",
    "What products do you have?",
    "Tell me about your pricing",
    "How do I get started?"
  ]

  console.log(`   Sending ${testMessages.length} test messages...`)
  console.log(`   (Note: Real responses require running dev server)`)
  console.log(``)

  // Create user messages (assistant responses would come from API)
  for (const content of testMessages) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content
      }
    })
  }

  console.log(`   ✅ Created ${testMessages.length} user messages`)
  console.log(``)

  // Step 5: Look for existing conversations with traces
  console.log(`Step 5: Looking for conversations with traces...`)
  
  const recentConversations = await prisma.conversation.findMany({
    where: {
      botId: bot.id,
      messages: {
        some: { role: 'assistant' }
      }
    },
    include: {
      messages: {
        where: { role: 'assistant' },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    },
    orderBy: { startedAt: 'desc' },
    take: 5
  })

  if (recentConversations.length === 0) {
    console.log(`   ⚠️  No conversations with assistant responses yet`)
    console.log(``)
    console.log(`   📝 TO GET TRACES:`)
    console.log(`   1. Start dev server: npm run dev`)
    console.log(`   2. Go to: http://localhost:3000/chat/${bot.id}`)
    console.log(`   3. Chat with the bot`)
    console.log(`   4. Run this script again to see traces`)
    console.log(``)
    return
  }

  console.log(`   ✅ Found ${recentConversations.length} conversations with responses`)
  console.log(``)

  // Step 6: Display traces
  console.log(`Step 6: Building and displaying traces...`)
  console.log(``)

  for (const conv of recentConversations.slice(0, 2)) {
    if (conv.messages.length === 0) continue

    const message = conv.messages[0]
    
    console.log(`───────────────────────────────────────────────────`)
    console.log(`Conversation: ${conv.id}`)
    console.log(`Message: "${message.content.substring(0, 60)}..."`)
    console.log(``)

    const trace = await buildDecisionTrace(conv.id, message.id)

    if (trace) {
      console.log(formatTraceForConsole(trace))
    } else {
      console.log(`   ⚠️  No trace available (events may be missing)`)
    }

    console.log(``)
  }

  // Step 7: Summary and next steps
  console.log(`==========================================`)
  console.log(`✅ PRODUCTION TEST COMPLETE`)
  console.log(`==========================================`)
  console.log(``)
  console.log(`📊 System Status:`)
  console.log(`   Bot ID: ${bot.id}`)
  console.log(`   KB Status: ${bot.kbStatus}`)
  console.log(`   KB Sources: ${kbSources}`)
  console.log(`   Conversations: ${recentConversations.length}`)
  console.log(``)
  console.log(`🔗 Quick Links:`)
  console.log(`   Dashboard: http://localhost:3000/dashboard`)
  console.log(`   Bot Setup: http://localhost:3000/chatbot/${bot.id}/setup`)
  console.log(`   Chat UI: http://localhost:3000/chat/${bot.id}`)
  console.log(``)
  console.log(`🛠️  Useful Commands:`)
  console.log(`   View trace: npx ts-node scripts/trace-decision.ts <messageId>`)
  console.log(`   Analyze events: npx ts-node scripts/analyze-events.ts ${bot.id}`)
  console.log(`   View timeline: npx ts-node scripts/view-event-timeline.ts bot ${bot.id}`)
  console.log(``)
}

testProduction()
  .then(() => {
    console.log(`✅ Done!\n`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })
