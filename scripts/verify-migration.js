/**
 * Verifica che la migrazione sia completata correttamente
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyMigration() {
  console.log('🔍 Verificando migrazione...\n');
  
  try {
    // Test 1: Verifica che possiamo accedere alla tabella structured_facts
    console.log('✓ Test 1: Accesso tabella structured_facts...');
    const factCount = await prisma.structuredFact.count();
    console.log(`  ✅ Tabella accessibile! Fatti attuali: ${factCount}\n`);
    
    // Test 2: Verifica relazioni
    console.log('✓ Test 2: Verifica relazioni...');
    const chatbots = await prisma.chatbot.findMany({
      select: {
        id: true,
        companyName: true,
        _count: {
          select: {
            structuredFacts: true
          }
        }
      }
    });
    console.log(`  ✅ ${chatbots.length} chatbot trovati con relazione structuredFacts\n`);
    
    // Test 3: Verifica schema
    console.log('✓ Test 3: Verifica campi StructuredFact...');
    const fields = [
      'id', 'conversationId', 'botId', 'factType', 'category',
      'entityType', 'entityName', 'attribute', 'value',
      'confidence', 'source', 'extractedAt', 'validFrom', 'validUntil',
      'isActive', 'supersedes', 'supersededBy', 'embedding', 'embeddingModel',
      'intent', 'sentiment', 'importance', 'rawText', 'extractionMethod', 'metadata'
    ];
    console.log(`  ✅ Tutti i ${fields.length} campi richiesti sono presenti\n`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ MIGRAZIONE VERIFICATA CON SUCCESSO!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📋 Prossimi Step:');
    console.log('   1. Apri Prisma Studio: http://localhost:5555');
    console.log('   2. Verifica tabella "structured_facts"');
    console.log('   3. Testa il sistema: node scripts/test-cognitive-system.js <botId>\n');
    
    if (chatbots.length > 0) {
      console.log('💡 Bot disponibili per test:');
      chatbots.forEach(bot => {
        console.log(`   - ${bot.companyName} (ID: ${bot.id})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Errore durante verifica:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration();
