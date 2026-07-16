/**
 * Diagnosi Problemi Knowledge Base
 * Verifica quali sources hanno problemi e perché
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  console.log('🔍 DIAGNOSI KNOWLEDGE BASE\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // 1. Verifica tutti i chatbot
    const chatbots = await prisma.chatbot.findMany({
      select: {
        id: true,
        companyName: true,
        kbStatus: true,
        kbTotalChunks: true,
        kbIndexingError: true,
        _count: {
          select: {
            knowledgeSources: true
          }
        }
      }
    });
    
    console.log(`📊 CHATBOT (${chatbots.length} totali)\n`);
    
    for (const bot of chatbots) {
      const statusIcon = bot.kbStatus === 'ready' ? '✅' : bot.kbStatus === 'indexing' ? '⏳' : bot.kbStatus === 'failed' ? '❌' : '⚠️';
      console.log(`${statusIcon} ${bot.companyName}`);
      console.log(`   ID: ${bot.id}`);
      console.log(`   Status: ${bot.kbStatus}`);
      console.log(`   Chunks: ${bot.kbTotalChunks}`);
      console.log(`   Sources: ${bot._count.knowledgeSources}`);
      if (bot.kbIndexingError) {
        console.log(`   ⚠️ Error: ${bot.kbIndexingError}`);
      }
      console.log('');
    }
    
    // 2. Verifica knowledge sources con problemi
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📄 KNOWLEDGE SOURCES CON PROBLEMI\n');
    
    const problematicSources = await prisma.knowledgeSource.findMany({
      where: {
        OR: [
          { status: 'failed' },
          { errorMessage: { not: null } }
        ]
      },
      include: {
        chatbot: {
          select: {
            companyName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    if (problematicSources.length === 0) {
      console.log('✅ Nessun problema trovato!\n');
    } else {
      console.log(`⚠️ ${problematicSources.length} source con problemi:\n`);
      
      for (const source of problematicSources) {
        console.log(`❌ ${source.sourceType.toUpperCase()}: ${source.sourceUrl || source.originalFilename}`);
        console.log(`   Bot: ${source.chatbot.companyName}`);
        console.log(`   Status: ${source.status}`);
        console.log(`   Content Length: ${source.contentText?.length || 0} chars`);
        console.log(`   Chunks: ${source.chunkCount}`);
        if (source.errorMessage) {
          console.log(`   Error: ${source.errorMessage}`);
        }
        console.log('');
      }
    }
    
    // 3. Verifica ingestion jobs falliti
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚙️ INGESTION JOBS FALLITI\n');
    
    const failedJobs = await prisma.ingestionJob.findMany({
      where: {
        status: 'failed'
      },
      include: {
        chatbot: {
          select: {
            companyName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });
    
    if (failedJobs.length === 0) {
      console.log('✅ Nessun job fallito!\n');
    } else {
      console.log(`⚠️ ${failedJobs.length} job falliti (ultimi 10):\n`);
      
      for (const job of failedJobs) {
        console.log(`❌ ${job.jobType} - ${job.chatbot.companyName}`);
        console.log(`   ID: ${job.id}`);
        console.log(`   Created: ${job.createdAt.toISOString()}`);
        console.log(`   Attempts: ${job.attempts}/${job.maxAttempts}`);
        if (job.errorMessage) {
          console.log(`   Error: ${job.errorMessage.substring(0, 200)}`);
        }
        console.log('');
      }
    }
    
    // 4. Statistiche generali
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📈 STATISTICHE GENERALI\n');
    
    const totalSources = await prisma.knowledgeSource.count();
    const completedSources = await prisma.knowledgeSource.count({
      where: { status: 'completed' }
    });
    const failedSources = await prisma.knowledgeSource.count({
      where: { status: 'failed' }
    });
    const emptySources = await prisma.knowledgeSource.count({
      where: {
        OR: [
          { contentText: '' },
          { contentText: null }
        ]
      }
    });
    
    console.log(`Total Sources: ${totalSources}`);
    console.log(`✅ Completed: ${completedSources} (${(completedSources/totalSources*100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${failedSources} (${(failedSources/totalSources*100).toFixed(1)}%)`);
    console.log(`⚠️ Empty Content: ${emptySources} (${(emptySources/totalSources*100).toFixed(1)}%)`);
    
    // 5. Suggerimenti
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 SUGGERIMENTI\n');
    
    if (failedSources > 0 || emptySources > 0) {
      console.log('⚠️ Problemi rilevati:');
      
      if (emptySources > 0) {
        console.log(`\n1. ${emptySources} sources hanno contentText vuoto/null`);
        console.log('   Possibili cause:');
        console.log('   - URL non raggiungibile (404, timeout)');
        console.log('   - Pagina protetta da autenticazione');
        console.log('   - Contenuto JavaScript non renderizzato');
        console.log('   - PDF corrotto o non leggibile');
        console.log('\n   Soluzione:');
        console.log('   - Verifica manualmente gli URL');
        console.log('   - Usa Firecrawl per contenuti JS');
        console.log('   - Ricarica i documenti problematici');
      }
      
      if (failedJobs.length > 0) {
        console.log(`\n2. ${failedJobs.length} ingestion jobs falliti`);
        console.log('   Soluzione:');
        console.log('   - Controlla i log degli errori sopra');
        console.log('   - Verifica FIRECRAWL_API_KEY nel .env');
        console.log('   - Riprova il crawling con maxPages più basso');
      }
      
      console.log('\n3. Come risolvere:');
      console.log('   a) Elimina sources problematici dal dashboard');
      console.log('   b) Ricarica i documenti/URL');
      console.log('   c) Usa un URL alternativo se disponibile');
    } else {
      console.log('✅ Tutto sembra OK!');
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Errore durante diagnosi:', error);
  } finally {
    await prisma.$disconnect();
  }
}

diagnose();
