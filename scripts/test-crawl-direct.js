/**
 * Test Crawl Diretto - Bypassa UI e testa direttamente
 */

require('dotenv').config()
const axios = require('axios')

const BASE_URL = 'http://localhost:3000'
const BOT_ID = 'd116a6c4-cbe0-4b3b-b129-fadac3e86576' // Il tuo bot
const TEST_URL = 'https://example.com'

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function testCrawl() {
  console.log('\n🧪 TEST CRAWL DIRETTO\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  console.log(`🤖 Bot ID: ${BOT_ID}`)
  console.log(`🌐 URL: ${TEST_URL}\n`)
  
  try {
    // Avvia crawl
    console.log('⏳ Avvio crawl...')
    
    const response = await axios.post(`${BASE_URL}/api/knowledge-sources/crawl-with-progress`, {
      botId: BOT_ID,
      url: TEST_URL,
      maxPages: 2
    })
    
    if (!response.data.success) {
      console.log('❌ Crawl failed:', response.data.error)
      return
    }
    
    const jobId = response.data.jobId
    console.log(`✅ Crawl started! Job ID: ${jobId}\n`)
    
    // Poll status
    console.log('⏳ Polling status...\n')
    
    for (let i = 0; i < 30; i++) {
      await sleep(2000)
      
      const statusRes = await axios.get(`${BASE_URL}/api/ingestion/status/${BOT_ID}`)
      const status = statusRes.data
      
      console.log(`   ${i+1}. Progress: ${status.progress}% - ${status.status}`)
      
      if (status.status === 'completed') {
        console.log('\n✅ Crawl completato!')
        console.log(`   Sources: ${status.sourcesCreated}`)
        console.log(`   Chunks: ${status.chunksCreated}`)
        break
      }
      
      if (status.status === 'failed') {
        console.log('\n❌ Crawl fallito!')
        console.log(`   Error: ${status.errorMessage}`)
        break
      }
    }
    
  } catch (error) {
    console.log('\n❌ Errore:', error.message)
    
    if (error.response) {
      console.log('   Response:', error.response.data)
    }
  }
}

console.log('⚠️  Assicurati che il server sia in esecuzione!\n')

testCrawl()
