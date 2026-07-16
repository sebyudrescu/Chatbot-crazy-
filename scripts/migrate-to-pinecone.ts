/**
 * MIGRATION SCRIPT: JSON Vector Store → Pinecone
 * 
 * Migra tutti i vettori esistenti dai file JSON a Pinecone.
 * Safe to run multiple times (idempotent).
 * 
 * Usage:
 *   npx ts-node scripts/migrate-to-pinecone.ts
 *   
 * Or migrate specific bot:
 *   npx ts-node scripts/migrate-to-pinecone.ts <botId>
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { upsertVectors, isPineconeConfigured, healthCheck } from '../lib/pinecone-vector-store'

const prisma = new PrismaClient()

interface VectorStoreData {
  botId: string
  documents: Array<{
    id: string
    text: string
    embedding: number[]
    metadata: any
  }>
  createdAt?: string
  updatedAt?: string
}

/**
 * Load JSON vector store for a bot
 */
function loadJSONVectorStore(botId: string): VectorStoreData | null {
  const storePath = path.join(process.cwd(), 'data', 'vector_store', botId, 'vectors.json')
  
  if (!fs.existsSync(storePath)) {
    return null
  }
  
  try {
    const data = fs.readFileSync(storePath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error(`❌ Error reading JSON file for bot ${botId}:`, error)
    return null
  }
}

/**
 * Migrate a single bot
 */
async function migrateBot(botId: string, dryRun: boolean = false): Promise<{
  success: boolean
  vectorsMigrated: number
  error?: string
}> {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📦 Bot: ${botId}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  
  try {
    // 1. Load JSON vector store
    console.log(`📂 Loading JSON vector store...`)
    const jsonData = loadJSONVectorStore(botId)
    
    if (!jsonData) {
      console.log(`⚠️  No JSON vector store found, skipping`)
      return { success: false, vectorsMigrated: 0, error: 'No JSON data' }
    }
    
    if (!jsonData.documents || jsonData.documents.length === 0) {
      console.log(`⚠️  No vectors found in JSON, skipping`)
      return { success: false, vectorsMigrated: 0, error: 'No vectors' }
    }
    
    console.log(`✅ Found ${jsonData.documents.length} vectors`)
    
    // 2. Get bot info from database
    const bot = await prisma.chatbot.findUnique({
      where: { id: botId },
      select: { id: true, companyName: true }
    })
    
    if (!bot) {
      console.log(`❌ Bot not found in database`)
      return { success: false, vectorsMigrated: 0, error: 'Bot not found' }
    }
    
    console.log(`🤖 Bot: ${bot.companyName}`)
    
    // 3. Convert to Pinecone format
    console.log(`🔄 Converting to Pinecone format...`)
    
    const vectorChunks = jsonData.documents.map(doc => ({
      id: doc.id,
      embedding: doc.embedding,
      text: doc.text,
      metadata: {
        ...doc.metadata,
        botId: botId,
        sourceId: doc.metadata.sourceId || 'unknown',
        chunkIndex: doc.metadata.chunkIndex || 0,
        sourceType: doc.metadata.sourceType || 'url',
        createdAt: doc.metadata.createdAt || new Date().toISOString()
      }
    }))
    
    console.log(`✅ Converted ${vectorChunks.length} vectors`)
    
    // 4. Upload to Pinecone (unless dry run)
    if (dryRun) {
      console.log(`🏃 DRY RUN - Would upload ${vectorChunks.length} vectors to Pinecone`)
      return { success: true, vectorsMigrated: vectorChunks.length }
    }
    
    console.log(`☁️  Uploading to Pinecone...`)
    await upsertVectors(botId, vectorChunks)
    
    console.log(`✅ Successfully migrated ${vectorChunks.length} vectors`)
    
    return {
      success: true,
      vectorsMigrated: vectorChunks.length
    }
    
  } catch (error) {
    console.error(`❌ Error migrating bot ${botId}:`, error)
    return {
      success: false,
      vectorsMigrated: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log(`\n🚀 PINECONE MIGRATION TOOL`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
  
  // Check if Pinecone is configured
  if (!isPineconeConfigured()) {
    console.error(`❌ Pinecone not configured!`)
    console.error(`   Please set PINECONE_API_KEY and PINECONE_INDEX_NAME in .env`)
    process.exit(1)
  }
  
  console.log(`✅ Pinecone configured`)
  
  // Health check
  console.log(`\n🏥 Checking Pinecone connection...`)
  const health = await healthCheck()
  
  if (!health.healthy) {
    console.error(`❌ Pinecone health check failed: ${health.error}`)
    process.exit(1)
  }
  
  console.log(`✅ Pinecone connection healthy`)
  console.log(`   Total vectors in index: ${health.stats?.totalVectors || 0}`)
  
  // Parse arguments
  const args = process.argv.slice(2)
  const specificBotId = args[0]
  const dryRun = args.includes('--dry-run')
  
  if (dryRun) {
    console.log(`\n🏃 DRY RUN MODE - No data will be uploaded`)
  }
  
  let botsToMigrate: Array<{ id: string; companyName: string }>
  
  if (specificBotId) {
    // Migrate specific bot
    console.log(`\n📋 Migrating specific bot: ${specificBotId}`)
    
    const bot = await prisma.chatbot.findUnique({
      where: { id: specificBotId },
      select: { id: true, companyName: true }
    })
    
    if (!bot) {
      console.error(`❌ Bot ${specificBotId} not found`)
      process.exit(1)
    }
    
    botsToMigrate = [bot]
    
  } else {
    // Migrate all bots with KB ready
    console.log(`\n📋 Finding bots to migrate...`)
    
    botsToMigrate = await prisma.chatbot.findMany({
      where: {
        kbStatus: 'ready'
      },
      select: {
        id: true,
        companyName: true
      }
    })
    
    console.log(`✅ Found ${botsToMigrate.length} bots with KB ready`)
  }
  
  if (botsToMigrate.length === 0) {
    console.log(`\n⚠️  No bots to migrate`)
    process.exit(0)
  }
  
  // Migrate each bot
  const results: Array<{
    botId: string
    companyName: string
    success: boolean
    vectorsMigrated: number
    error?: string
  }> = []
  
  for (const bot of botsToMigrate) {
    const result = await migrateBot(bot.id, dryRun)
    results.push({
      botId: bot.id,
      companyName: bot.companyName,
      ...result
    })
    
    // Wait 1 second between bots to avoid rate limits
    if (botsToMigrate.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  // Summary
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📊 MIGRATION SUMMARY`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
  
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  const totalVectors = successful.reduce((sum, r) => sum + r.vectorsMigrated, 0)
  
  console.log(`✅ Successful: ${successful.length}`)
  console.log(`❌ Failed: ${failed.length}`)
  console.log(`📦 Total vectors migrated: ${totalVectors}`)
  
  if (successful.length > 0) {
    console.log(`\n✅ Successfully migrated:`)
    successful.forEach(r => {
      console.log(`   - ${r.companyName}: ${r.vectorsMigrated} vectors`)
    })
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed migrations:`)
    failed.forEach(r => {
      console.log(`   - ${r.companyName}: ${r.error}`)
    })
  }
  
  if (dryRun) {
    console.log(`\n💡 This was a dry run. Run without --dry-run to actually migrate.`)
  } else {
    console.log(`\n✅ Migration complete!`)
    console.log(`\n💡 Next steps:`)
    console.log(`   1. Verify data in Pinecone dashboard`)
    console.log(`   2. Test queries with your chatbot`)
    console.log(`   3. Once verified, you can delete JSON files:`)
    console.log(`      rm -rf data/vector_store/*/vectors.json`)
  }
}

// Run migration
main()
  .catch(error => {
    console.error(`\n💥 Fatal error:`, error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
