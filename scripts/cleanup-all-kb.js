/**
 * CLEANUP - Pulisci tutta la Knowledge Base
 * Rimuove tutti i vettori, sources, e job per ricominciare pulito
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { Pinecone } = require('@pinecone-database/pinecone')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function cleanup() {
  console.log('\n🧹 CLEANUP COMPLETO KNOWLEDGE BASE\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  try {
    // 1. Delete all ingestion jobs
    console.log('1. Eliminando ingestion jobs...')
    const deletedJobs = await prisma.ingestionJob.deleteMany({})
    console.log(`   ✅ ${deletedJobs.count} job eliminati`)
    
    // 2. Delete all knowledge sources
    console.log('\n2. Eliminando knowledge sources...')
    const deletedSources = await prisma.knowledgeSource.deleteMany({})
    console.log(`   ✅ ${deletedSources.count} sources eliminati`)
    
    // 3. Reset chatbot KB status
    console.log('\n3. Resettando status chatbot...')
    const updatedBots = await prisma.chatbot.updateMany({
      data: {
        kbStatus: 'empty',
        kbTotalChunks: 0,
        kbIndexingError: null,
        kbLastIndexed: null
      }
    })
    console.log(`   ✅ ${updatedBots.count} chatbot resettati a "empty"`)
    
    // 4. Clear Pinecone (if configured)
    const apiKey = process.env.PINECONE_API_KEY
    
    if (apiKey) {
      console.log('\n4. Pulendo Pinecone index...')
      
      try {
        const pinecone = new Pinecone({ apiKey })
        const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-knowledge-base'
        const index = pinecone.index(indexName)
        
        // Delete all vectors
        await index.deleteAll()
        
        console.log('   ✅ Pinecone index pulito')
      } catch (error) {
        console.log(`   ⚠️ Errore pulendo Pinecone: ${error.message}`)
      }
    } else {
      console.log('\n4. Pinecone non configurato, skip')
    }
    
    // 5. Delete JSON vector stores
    console.log('\n5. Eliminando file JSON vector stores...')
    const vectorStoreDir = path.join(process.cwd(), 'data', 'vector_store')
    
    if (fs.existsSync(vectorStoreDir)) {
      const botDirs = fs.readdirSync(vectorStoreDir)
      
      for (const botDir of botDirs) {
        const botPath = path.join(vectorStoreDir, botDir)
        if (fs.statSync(botPath).isDirectory()) {
          fs.rmSync(botPath, { recursive: true, force: true })
        }
      }
      
      console.log(`   ✅ ${botDirs.length} directory vector store eliminate`)
    } else {
      console.log('   ℹ️ Nessuna directory vector store trovata')
    }
    
    // 6. Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ CLEANUP COMPLETATO!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    console.log('📊 Riepilogo:')
    console.log(`   - ${deletedJobs.count} job eliminati`)
    console.log(`   - ${deletedSources.count} knowledge sources eliminati`)
    console.log(`   - ${updatedBots.count} chatbot resettati`)
    console.log('   - Pinecone pulito')
    console.log('   - File JSON eliminati\n')
    
    console.log('🎉 Sistema pulito e pronto per testing!\n')
    
  } catch (error) {
    console.error('\n❌ Errore durante cleanup:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

cleanup()
