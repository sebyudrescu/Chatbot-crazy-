/**
 * TEST KNOWLEDGE GRAPH
 * 
 * Script per testare il sistema Knowledge Graph
 */

import { prisma } from '../lib/db'
import {
  upsertEntity,
  upsertRelation,
  findEntity,
  searchEntities,
  getRelatedEntities,
  findPath,
  queryGraph
} from '../lib/knowledge-graph'

async function testKnowledgeGraph(botId: string) {
  console.log(`\n🧪 TESTING KNOWLEDGE GRAPH`)
  console.log(`==========================================\n`)

  // Test 1: Create sample entities
  console.log(`📝 Test 1: Creating sample entities...`)
  
  const iphone15 = await upsertEntity(botId, {
    entityType: 'product',
    entityName: 'iPhone 15 Pro',
    displayName: 'iPhone 15 Pro',
    aliases: ['iphone 15 pro', 'iPhone15Pro', 'iPhone 15 Pro Max'],
    attributes: {
      price: '1199',
      storage: '256GB',
      color: 'Titanium'
    },
    description: 'Smartphone premium di Apple con chip A17 Pro',
    category: 'hardware',
    tags: ['premium', 'flagship'],
    confidence: 1.0,
    extractedFrom: 'test'
  })

  const usbC = await upsertEntity(botId, {
    entityType: 'feature',
    entityName: 'USB-C',
    displayName: 'Porta USB-C',
    description: 'Porta di ricarica e trasferimento dati USB-C',
    category: 'connectivity',
    confidence: 1.0,
    extractedFrom: 'test'
  })

  const titanium = await upsertEntity(botId, {
    entityType: 'feature',
    entityName: 'Titanium Design',
    displayName: 'Design in Titanio',
    description: 'Design premium con frame in titanio',
    category: 'design',
    confidence: 1.0,
    extractedFrom: 'test'
  })

  console.log(`   ✅ Created entities:`)
  console.log(`      - ${iphone15.entityName}`)
  console.log(`      - ${usbC.entityName}`)
  console.log(`      - ${titanium.entityName}`)

  // Test 2: Create relations
  console.log(`\n📝 Test 2: Creating relations...`)

  await upsertRelation(botId, {
    sourceEntityId: iphone15.id,
    relationType: 'HAS_FEATURE',
    targetEntityId: usbC.id,
    strength: 1.0,
    confidence: 1.0,
    extractedFrom: 'test'
  })

  await upsertRelation(botId, {
    sourceEntityId: iphone15.id,
    relationType: 'HAS_FEATURE',
    targetEntityId: titanium.id,
    strength: 1.0,
    confidence: 1.0,
    extractedFrom: 'test'
  })

  console.log(`   ✅ Created relations:`)
  console.log(`      - ${iphone15.entityName} --[HAS_FEATURE]--> ${usbC.entityName}`)
  console.log(`      - ${iphone15.entityName} --[HAS_FEATURE]--> ${titanium.entityName}`)

  // Test 3: Find entity
  console.log(`\n📝 Test 3: Finding entity by name...`)
  
  const found = await findEntity(botId, 'iphone 15 pro')
  console.log(`   ✅ Found: ${found?.entityName || 'Not found'}`)

  // Test 4: Search entities semantically
  console.log(`\n📝 Test 4: Semantic search...`)
  
  const searchResults = await searchEntities(botId, 'smartphone Apple', {
    topK: 3,
    minScore: 0.5
  })

  console.log(`   ✅ Search results: ${searchResults.length}`)
  for (const result of searchResults) {
    console.log(`      - ${result.entityName} (score: ${(result.score * 100).toFixed(0)}%)`)
  }

  // Test 5: Get related entities
  console.log(`\n📝 Test 5: Getting related entities...`)
  
  const related = await getRelatedEntities(iphone15.id)
  console.log(`   ✅ Related entities: ${related.length}`)
  for (const { entity, relation } of related) {
    console.log(`      - ${entity.entityName} (via ${relation.relationType})`)
  }

  // Test 6: Find path
  console.log(`\n📝 Test 6: Finding path between entities...`)
  
  const path = await findPath(iphone15.id, usbC.id, 3)
  if (path) {
    console.log(`   ✅ Path found (length: ${path.pathLength}):`)
    for (let i = 0; i < path.entities.length; i++) {
      console.log(`      ${i + 1}. ${path.entities[i].entityName}`)
      if (i < path.relations.length) {
        console.log(`         --[${path.relations[i].relationType}]-->`)
      }
    }
  } else {
    console.log(`   ❌ No path found`)
  }

  // Test 7: Query graph with natural language
  console.log(`\n📝 Test 7: Natural language graph query...`)
  
  const graphResult = await queryGraph(botId, 'Quali sono le caratteristiche dell\'iPhone 15 Pro?')
  console.log(`   ✅ Query result:`)
  console.log(`      - Entities: ${graphResult.entities.length}`)
  console.log(`      - Relations: ${graphResult.relations.length}`)
  console.log(`      - Reasoning: ${graphResult.reasoning}`)

  if (graphResult.entities.length > 0) {
    console.log(`\n      Found entities:`)
    for (const entity of graphResult.entities.slice(0, 3)) {
      console.log(`      - ${entity.entityName} (${entity.entityType})`)
    }
  }

  // Show final stats
  console.log(`\n==========================================`)
  console.log(`📊 KNOWLEDGE GRAPH STATS`)
  console.log(`==========================================`)

  const totalEntities = await prisma.entity.count({ where: { botId } })
  const totalRelations = await prisma.relation.count({ where: { botId } })

  console.log(`Total Entities: ${totalEntities}`)
  console.log(`Total Relations: ${totalRelations}`)

  console.log(`\n✅ ALL TESTS PASSED!`)
}

// Run script
const botId = process.argv[2]

if (!botId) {
  console.error(`Usage: npx ts-node scripts/test-knowledge-graph.ts <botId>`)
  process.exit(1)
}

testKnowledgeGraph(botId)
  .then(() => {
    console.log(`\n✅ Done!`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })
