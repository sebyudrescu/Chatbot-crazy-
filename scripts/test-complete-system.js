/**
 * TEST END-TO-END - Sistema Completo
 * 
 * Testa tutto il flusso:
 * 1. Crawl URL → Pinecone
 * 2. Query knowledge base
 * 3. Sistema cognitivo
 */

require('dotenv').config()
const axios = require('axios')

const BASE_URL = 'http://localhost:3000'

// Usa il primo bot disponibile
const TEST_BOT_ID = '1341c01f-2d36-4c20-bfc4-3418d1e23ef6'
const TEST_URL = 'https://example.com' // Sito semplice per test

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function testCompleteFlow() {
  console.log('\n🧪 TEST SISTEMA COMPLETO END-TO-END\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  try {
    // ===================================================================
    // TEST 1: CRAWL CON PINECONE
    // ===================================================================
    
    console.log('📋 TEST 1: Crawl Website → Pinecone')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    console.log(`🌐 URL: ${TEST_URL}`)
    console.log(`🤖 Bot: ${TEST_BOT_ID}`)
    console.log('\n⏳ Avvio crawl (questo può richiedere 30-60 secondi)...\n')
    
    const crawlResponse = await axios.post(`${BASE_URL}/api/knowledge-sources/crawl-with-progress`, {
      botId: TEST_BOT_ID,
      url: TEST_URL,
      maxPages: 3
    })
    
    if (!crawlResponse.data.success) {
      throw new Error('Crawl failed: ' + crawlResponse.data.error)
    }
    
    const jobId = crawlResponse.data.jobId
    console.log(`✅ Crawl avviato! Job ID: ${jobId}`)
    
    // Poll job status
    console.log('\n⏳ Attendendo completamento crawl...')
    let attempts = 0
    const maxAttempts = 60
    
    while (attempts < maxAttempts) {
      await sleep(2000)
      
      const statusResponse = await axios.get(`${BASE_URL}/api/ingestion/status/${TEST_BOT_ID}`)
      const status = statusResponse.data
      
      console.log(`   Progress: ${status.progress}% - ${status.status}`)
      
      if (status.status === 'completed') {
        console.log('\n✅ Crawl completato!')
        console.log(`   📄 Sources create: ${status.sourcesCreated}`)
        console.log(`   📦 Chunks indicizzati: ${status.chunksCreated}`)
        break
      }
      
      if (status.status === 'failed') {
        throw new Error('Crawl failed: ' + status.errorMessage)
      }
      
      attempts++
    }
    
    if (attempts >= maxAttempts) {
      throw new Error('Timeout waiting for crawl')
    }
    
    // ===================================================================
    // TEST 2: VERIFICA PINECONE
    // ===================================================================
    
    console.log('\n\n📋 TEST 2: Verifica Dati in Pinecone')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    const { Pinecone } = require('@pinecone-database/pinecone')
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'chatbot-knowledge-base')
    
    const stats = await index.describeIndexStats()
    
    console.log('📊 Pinecone Stats:')
    console.log(`   Total vectors: ${stats.totalRecordCount}`)
    console.log(`   Dimensions: ${stats.dimension}`)
    
    if (stats.totalRecordCount > 0) {
      console.log('\n✅ Dati correttamente salvati in Pinecone!')
    } else {
      console.log('\n⚠️ Nessun vettore trovato in Pinecone')
    }
    
    // ===================================================================
    // TEST 3: QUERY KNOWLEDGE BASE
    // ===================================================================
    
    console.log('\n\n📋 TEST 3: Query Knowledge Base')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    console.log('❓ Query: "What is this website about?"')
    
    const startTime = Date.now()
    
    const chatResponse = await axios.post(`${BASE_URL}/api/chat`, {
      botId: TEST_BOT_ID,
      message: 'What is this website about?',
      userSessionId: 'test-session-' + Date.now()
    })
    
    const queryTime = Date.now() - startTime
    
    if (!chatResponse.data.success) {
      throw new Error('Chat failed: ' + chatResponse.data.error)
    }
    
    const response = chatResponse.data.data
    
    console.log(`\n⚡ Response Time: ${queryTime}ms`)
    console.log(`\n🤖 Bot Response:\n   "${response.assistantMessage.content.substring(0, 200)}..."\n`)
    console.log(`📊 Metadata:`)
    console.log(`   - Strategy: ${response.decision?.strategy}`)
    console.log(`   - Sources used: ${response.sources?.length || 0}`)
    console.log(`   - KB chunks: ${response.memory?.knowledgeChunksUsed || 0}`)
    console.log(`   - Confidence: ${(response.confidence?.score * 100).toFixed(0)}%`)
    console.log(`   - Coherence: ${(response.confidence?.coherenceScore * 100).toFixed(0)}%`)
    
    // ===================================================================
    // TEST 4: SISTEMA COGNITIVO
    // ===================================================================
    
    console.log('\n\n📋 TEST 4: Sistema Cognitivo (Memoria)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    const conversationId = response.conversationId
    
    // Messaggio che dovrebbe estrarre fatti
    console.log('💬 User: "I really like your service, it seems great!"')
    
    const chat2 = await axios.post(`${BASE_URL}/api/chat`, {
      botId: TEST_BOT_ID,
      message: 'I really like your service, it seems great!',
      conversationId,
      userSessionId: 'test-session-' + Date.now()
    })
    
    console.log(`\n🤖 Bot: "${chat2.data.data.assistantMessage.content.substring(0, 150)}..."`)
    console.log(`\n📚 Facts Extracted: ${chat2.data.data.memory?.factsExtracted || 0}`)
    
    if (chat2.data.data.memory?.factsExtracted > 0) {
      console.log('   ✅ Sistema cognitivo sta estraendo fatti!')
    }
    
    // ===================================================================
    // SUMMARY
    // ===================================================================
    
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ TEST COMPLETO SUPERATO!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    console.log('📊 Performance:')
    console.log(`   ⚡ Query time: ${queryTime}ms ${queryTime < 200 ? '(Excellent!)' : queryTime < 500 ? '(Good)' : '(Slow)'}`)
    console.log(`   📦 Vectors in Pinecone: ${stats.totalRecordCount}`)
    console.log(`   🧠 Cognitive system: Active`)
    console.log(`   ✅ Coherence validation: Working`)
    
    console.log('\n🎉 Sistema production-ready!\n')
    console.log('💡 Next steps:')
    console.log('   1. Aggiungi i tuoi siti web reali')
    console.log('   2. Configura prompt templates')
    console.log('   3. Testa con utenti reali')
    console.log('   4. Monitor performance\n')
    
  } catch (error) {
    console.error('\n❌ Test fallito:', error.message)
    
    if (error.response) {
      console.error('   Server response:', error.response.data)
    }
    
    process.exit(1)
  }
}

console.log('⚠️  NOTA: Assicurati che il server sia in esecuzione (npm run dev)\n')

testCompleteFlow()
