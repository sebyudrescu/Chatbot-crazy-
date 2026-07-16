/**
 * POPULATE KNOWLEDGE GRAPH
 * 
 * Script per popolare il Knowledge Graph da knowledge sources esistenti
 * Estrae entità e relazioni da tutti i documenti di un bot
 */

import { prisma } from '../lib/db'
import { extractFromKnowledgeBase } from '../lib/entity-extractor'

async function populateKnowledgeGraph(botId: string) {
  console.log(`\n🕸️ POPULATING KNOWLEDGE GRAPH for bot ${botId}`)
  console.log(`==========================================\n`)

  // Get chatbot info
  const bot = await prisma.chatbot.findUnique({
    where: { id: botId },
    include: {
      knowledgeSources: {
        where: { status: 'completed' }
      }
    }
  })

  if (!bot) {
    console.error(`❌ Bot not found: ${botId}`)
    return
  }

  console.log(`📊 Bot: ${bot.companyName}`)
  console.log(`📚 Knowledge Sources: ${bot.knowledgeSources.length}`)
  console.log(``)

  if (bot.knowledgeSources.length === 0) {
    console.log(`⚠️ No completed knowledge sources found`)
    return
  }

  let totalEntities = 0
  let totalRelations = 0

  // Process each knowledge source
  for (let i = 0; i < bot.knowledgeSources.length; i++) {
    const source = bot.knowledgeSources[i]
    
    console.log(`\n[${i + 1}/${bot.knowledgeSources.length}] Processing: ${source.sourceType} - ${source.sourceUrl || source.originalFilename}`)
    
    if (!source.contentText || source.contentText.trim().length === 0) {
      console.log(`   ⚠️ No content, skipping`)
      continue
    }

    try {
      const result = await extractFromKnowledgeBase(
        botId,
        source.id,
        source.contentText,
        {
          domain: bot.companyName
        }
      )

      totalEntities += result.entitiesCreated
      totalRelations += result.relationsCreated

      console.log(`   ✅ Created ${result.entitiesCreated} entities, ${result.relationsCreated} relations`)
    } catch (error: any) {
      console.error(`   ❌ Error:`, error.message)
    }
  }

  console.log(`\n==========================================`)
  console.log(`✅ COMPLETED`)
  console.log(`📊 Total Entities: ${totalEntities}`)
  console.log(`📊 Total Relations: ${totalRelations}`)
  console.log(`==========================================\n`)

  // Show summary
  const entities = await prisma.entity.count({ where: { botId } })
  const relations = await prisma.relation.count({ where: { botId } })

  console.log(`📈 Knowledge Graph Stats:`)
  console.log(`   - Total Entities: ${entities}`)
  console.log(`   - Total Relations: ${relations}`)

  // Show entity types distribution
  const entityTypes = await prisma.entity.groupBy({
    by: ['entityType'],
    where: { botId },
    _count: true
  })

  console.log(`\n📊 Entity Types:`)
  for (const type of entityTypes) {
    console.log(`   - ${type.entityType}: ${type._count}`)
  }
}

// Run script
const botId = process.argv[2]

if (!botId) {
  console.error(`Usage: npx ts-node scripts/populate-knowledge-graph.ts <botId>`)
  process.exit(1)
}

populateKnowledgeGraph(botId)
  .then(() => {
    console.log(`\n✅ Done!`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })
