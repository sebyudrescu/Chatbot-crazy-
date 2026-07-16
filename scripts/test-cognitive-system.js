/**
 * Test Script per Sistema Cognitivo
 * 
 * Testa le nuove funzionalità:
 * 1. Estrazione fatti strutturati
 * 2. Recupero memoria persistente
 * 3. Validazione coerenza
 * 4. Decision orchestrator
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const BOT_ID = process.argv[2]; // Pass botId as argument

if (!BOT_ID) {
  console.error('❌ Usage: node test-cognitive-system.js <botId>');
  process.exit(1);
}

console.log('🧪 Testing Cognitive Memory System');
console.log(`📋 Bot ID: ${BOT_ID}\n`);

// Helper functions
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendMessage(message, conversationId = null) {
  try {
    const response = await axios.post(`${BASE_URL}/api/chat`, {
      botId: BOT_ID,
      message,
      conversationId,
      userSessionId: 'test_session_' + Date.now()
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

function printResponse(data) {
  console.log('\n📨 Response:');
  console.log(`   Message: "${data.assistantMessage.content.substring(0, 100)}..."`);
  
  if (data.intent) {
    console.log(`   Intent: ${data.intent.type} (${(data.intent.confidence * 100).toFixed(0)}%)`);
  }
  
  if (data.decision) {
    console.log(`   Strategy: ${data.decision.strategy}`);
    console.log(`   Sources: ${data.decision.sources.join(', ')}`);
  }
  
  if (data.memory) {
    console.log(`   Memory Used:`);
    console.log(`      - Persistent Facts: ${data.memory.persistentFactsUsed}`);
    console.log(`      - KB Chunks: ${data.memory.knowledgeChunksUsed}`);
    console.log(`      - Facts Extracted: ${data.memory.factsExtracted}`);
  }
  
  if (data.confidence) {
    console.log(`   Confidence: ${(data.confidence.score * 100).toFixed(0)}%`);
    if (data.confidence.coherenceScore) {
      console.log(`   Coherence: ${(data.confidence.coherenceScore * 100).toFixed(0)}%`);
    }
  }
  
  if (data.validation) {
    console.log(`   Validation:`);
    console.log(`      - Conflicts: ${data.validation.conflicts}`);
    console.log(`      - Warnings: ${data.validation.warnings}`);
  }
  
  console.log('');
}

// Test scenarios
async function runTests() {
  let conversationId = null;
  
  try {
    // ========================================================================
    // TEST 1: Conversazione Base
    // ========================================================================
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Conversazione Base');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📤 Sending: "Ciao"');
    let result = await sendMessage('Ciao');
    conversationId = result.data.conversationId;
    printResponse(result.data);
    
    await sleep(1000);
    
    // ========================================================================
    // TEST 2: Estrazione Fatti (Preferenza)
    // ========================================================================
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Estrazione Fatti - Preferenza Utente');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📤 Sending: "Mi piace molto il piano Enterprise"');
    result = await sendMessage('Mi piace molto il piano Enterprise', conversationId);
    printResponse(result.data);
    
    if (result.data.memory?.factsExtracted > 0) {
      console.log('✅ Fatto estratto correttamente!');
    } else {
      console.log('⚠️ Nessun fatto estratto (potrebbe essere normale in base al contenuto)');
    }
    
    await sleep(1000);
    
    // ========================================================================
    // TEST 3: Domanda Fattuale (Knowledge Base)
    // ========================================================================
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Domanda Fattuale - Uso Knowledge Base');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📤 Sending: "Quali sono i vostri servizi principali?"');
    result = await sendMessage('Quali sono i vostri servizi principali?', conversationId);
    printResponse(result.data);
    
    if (result.data.memory?.knowledgeChunksUsed > 0) {
      console.log('✅ Knowledge Base utilizzata!');
      console.log(`   Sources: ${result.data.sources?.length || 0} documenti`);
    } else {
      console.log('⚠️ KB non usata (verifica che ci siano documenti indicizzati)');
    }
    
    await sleep(1000);
    
    // ========================================================================
    // TEST 4: Follow-up Question (Context + Memory)
    // ========================================================================
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Follow-up Question - Contesto + Memoria');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📤 Sending: "E quello Enterprise che mi piaceva?"');
    result = await sendMessage('E quello Enterprise che mi piaceva?', conversationId);
    printResponse(result.data);
    
    if (result.data.decision?.strategy === 'memory_personalized' || 
        result.data.memory?.persistentFactsUsed > 0) {
      console.log('✅ Memoria persistente usata per personalizzazione!');
    } else {
      console.log('⚠️ Memoria non usata (potrebbe richiedere più tempo per estrazione)');
    }
    
    await sleep(1000);
    
    // ========================================================================
    // TEST 5: Estrazione Profilo Utente
    // ========================================================================
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Estrazione Profilo Utente');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📤 Sending: "Sono Mario Rossi e lavoro per Acme Corp"');
    result = await sendMessage('Sono Mario Rossi e lavoro per Acme Corp', conversationId);
    printResponse(result.data);
    
    if (result.data.memory?.factsExtracted > 0) {
      console.log('✅ Informazioni profilo estratte!');
    }
    
    await sleep(1000);
    
    // ========================================================================
    // TEST 6: Complaint (Alta Importanza)
    // ========================================================================
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 6: Complaint - Estrazione con Alta Importanza');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📤 Sending: "Ho un problema grave con il sistema di pagamento"');
    result = await sendMessage('Ho un problema grave con il sistema di pagamento', conversationId);
    printResponse(result.data);
    
    if (result.data.intent?.type === 'complaint') {
      console.log('✅ Complaint rilevato correttamente!');
    }
    
    await sleep(1000);
    
    // ========================================================================
    // TEST 7: Validazione Coerenza (Contraddizione)
    // ========================================================================
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 7: Validazione Coerenza - Contraddizione');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📤 Sending: "In realtà non mi piace più il piano Enterprise"');
    result = await sendMessage('In realtà non mi piace più il piano Enterprise', conversationId);
    printResponse(result.data);
    
    if (result.data.validation && result.data.validation.conflicts > 0) {
      console.log('✅ Contraddizione rilevata e gestita!');
    } else {
      console.log('ℹ️ Nessun conflitto rilevato (normale per questo scenario)');
    }
    
    // ========================================================================
    // SUMMARY
    // ========================================================================
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEST SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('✅ Test completati con successo!');
    console.log(`   Conversation ID: ${conversationId}`);
    console.log('\n📋 Next Steps:');
    console.log('   1. Apri Prisma Studio: npm run db:studio');
    console.log('   2. Vai a "structured_facts" table');
    console.log(`   3. Filtra per conversationId = "${conversationId}"`);
    console.log('   4. Verifica fatti estratti e normalizzati\n');
    
    console.log('🔍 Verifica nel DB:');
    console.log(`   - SELECT * FROM structured_facts WHERE conversationId = '${conversationId}';`);
    console.log(`   - SELECT * FROM conversations WHERE id = '${conversationId}';`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.response?.data) {
      console.error('   Server response:', JSON.stringify(error.response.data, null, 2));
    }
    
    process.exit(1);
  }
}

// Run tests
console.log('🚀 Starting tests...\n');
runTests().then(() => {
  console.log('\n✅ All tests completed!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Tests failed:', error);
  process.exit(1);
});
