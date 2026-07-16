/**
 * SIMPLE TEST
 * Test semplice che usa API invece di import diretti
 */

async function test() {
  console.log('\n🧪 TESTING SYSTEM VIA API\n')
  
  const baseUrl = 'http://localhost:3000'
  
  try {
    // 1. Check server
    console.log('1. Checking server...')
    const healthRes = await fetch(`${baseUrl}/api/health`)
    if (healthRes.ok) {
      console.log('   ✅ Server is running')
    } else {
      console.log('   ❌ Server not responding')
      return
    }
    console.log('')
    
    // 2. Get chatbots
    console.log('2. Getting chatbots...')
    const botsRes = await fetch(`${baseUrl}/api/chatbots`)
    const botsData = await botsRes.json()
    
    if (botsData.chatbots && botsData.chatbots.length > 0) {
      console.log(`   ✅ Found ${botsData.chatbots.length} bots`)
      
      const bot = botsData.chatbots[0]
      console.log(`   Bot: ${bot.companyName} (${bot.id})`)
      console.log(`   KB Status: ${bot.kbStatus}`)
      console.log('')
      
      // 3. Get conversations
      console.log('3. Getting conversations...')
      const convsRes = await fetch(`${baseUrl}/api/conversations?botId=${bot.id}`)
      const convsData = await convsRes.json()
      
      if (convsData.conversations && convsData.conversations.length > 0) {
        console.log(`   ✅ Found ${convsData.conversations.length} conversations`)
        console.log('')
        
        // 4. Try to get trace
        console.log('4. Looking for traces...')
        console.log('   (Need assistant messages for traces)')
        console.log('')
      } else {
        console.log('   ⚠️  No conversations yet')
        console.log('')
      }
      
      // 5. Links
      console.log('━'.repeat(60))
      console.log('🔗 USEFUL LINKS')
      console.log('━'.repeat(60))
      console.log('')
      console.log(`Dashboard: ${baseUrl}/dashboard`)
      console.log(`Traces Dashboard: ${baseUrl}/dashboard/traces`)
      console.log(`Bot Setup: ${baseUrl}/chatbot/${bot.id}/setup`)
      console.log(`Chat: ${baseUrl}/chat/${bot.id}`)
      console.log('')
      console.log('💡 Next Steps:')
      console.log('   1. Open Traces Dashboard in browser')
      console.log('   2. Chat with bot to generate traces')
      console.log('   3. View traces in dashboard')
      console.log('')
      
    } else {
      console.log('   ⚠️  No bots found')
      console.log('')
      console.log('   Create a bot at: ' + baseUrl + '/chatbots')
      console.log('')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.log('')
    console.log('Make sure:')
    console.log('   1. Server is running (npm run dev)')
    console.log('   2. Server is on port 3000')
    console.log('')
  }
}

test()
  .then(() => {
    console.log('✅ Test complete!\n')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
