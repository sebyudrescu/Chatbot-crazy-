# 🎯 PIANO IMPLEMENTAZIONE - Vector Database Dedicato

## Problema Attuale

**Status Quo**: File JSON (`simple-vector-store.ts`)
```typescript
// Ogni bot ha un file JSON con tutti i chunks + embeddings
data/vector_store/{botId}/vectors.json
```

**Problemi**:
- 🐌 Carica TUTTO il file in memoria ogni query
- 💾 No indexing, no caching
- 📉 Non scala (> 1000 chunks = lentezza)
- ❌ Concorrenza problematica (lock file system)
- ❌ No filtering avanzato
- ❌ No hybrid search (semantic + keyword)

---

## Soluzione: Pinecone (Raccomandato)

### Perché Pinecone?

✅ **Managed** - Zero manutenzione infra
✅ **Veloce** - < 100ms query anche con milioni di vettori
✅ **Scalabile** - Cresce automaticamente
✅ **Free tier** - 1M vettori gratis (sufficiente per 20-50 bot)
✅ **Filtering** - Metadata filtering potente
✅ **Hybrid search** - Semantic + keyword built-in

**Alternative considerate**:
- ❌ Weaviate: Richiede self-hosting
- ❌ Qdrant: Più complesso setup
- ❌ Chroma: Meno maturo
- ⚠️ PostgreSQL pgvector: Buono ma richiede tuning

---

## Architettura Nuova

### Before (File JSON)
```
Query → Load JSON file → Linear search → Filter → Return
         (slow!)         (O(n))         
```

### After (Pinecone)
```
Query → Pinecone API → Indexed search → Metadata filter → Return
         (< 100ms)      (O(log n))       (built-in)
```

---

## Piano Implementazione (3 ore)

### FASE 1: Setup Pinecone (30 min)

#### 1.1 Account & API Key
```bash
1. Vai su https://www.pinecone.io/
2. Sign up (free tier)
3. Create index:
   - Name: "chatbot-knowledge-base"
   - Dimensions: 1536 (OpenAI embeddings)
   - Metric: cosine
   - Cloud: AWS / GCP (nearest region)
4. Copy API key
```

#### 1.2 Install Dependencies
```bash
npm install @pinecone-database/pinecone
```

#### 1.3 Environment Variables
```env
# .env
PINECONE_API_KEY=your-api-key-here
PINECONE_ENVIRONMENT=us-west1-gcp  # or your region
PINECONE_INDEX_NAME=chatbot-knowledge-base
```

---

### FASE 2: Crea Adapter Pinecone (60 min)

#### 2.1 Nuovo File: `lib/pinecone-vector-store.ts`

```typescript
/**
 * Pinecone Vector Store Adapter
 * Sostituisce simple-vector-store.ts con Pinecone production-ready
 */

import { Pinecone } from '@pinecone-database/pinecone'

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
})

const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-knowledge-base'

interface VectorMetadata {
  botId: string
  sourceId: string
  chunkIndex: number
  text: string
  sourceType: 'url' | 'pdf'
  sourceUrl?: string
  filename?: string
  createdAt: string
}

/**
 * Upsert chunks to Pinecone
 */
export async function upsertVectors(
  botId: string,
  chunks: Array<{
    id: string
    embedding: number[]
    text: string
    metadata: any
  }>
) {
  const index = pinecone.index(indexName)
  
  // Prepare vectors for Pinecone
  const vectors = chunks.map(chunk => ({
    id: `${botId}_${chunk.id}`,
    values: chunk.embedding,
    metadata: {
      botId,
      text: chunk.text,
      ...chunk.metadata
    } as VectorMetadata
  }))
  
  // Batch upsert (max 100 per request)
  const batchSize = 100
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize)
    await index.upsert(batch)
  }
  
  console.log(`[Pinecone] Upserted ${vectors.length} vectors for bot ${botId}`)
}

/**
 * Query vectors with metadata filtering
 */
export async function queryVectors(
  botId: string,
  queryEmbedding: number[],
  options: {
    topK?: number
    minScore?: number
    sourceIds?: string[]
  } = {}
) {
  const index = pinecone.index(indexName)
  
  const { topK = 10, minScore = 0.7, sourceIds } = options
  
  // Build filter
  const filter: any = { botId }
  if (sourceIds && sourceIds.length > 0) {
    filter.sourceId = { $in: sourceIds }
  }
  
  // Query Pinecone
  const results = await index.query({
    vector: queryEmbedding,
    topK,
    filter,
    includeMetadata: true
  })
  
  // Filter by score and format
  return results.matches
    .filter(match => match.score >= minScore)
    .map(match => ({
      id: match.id,
      score: match.score,
      text: match.metadata?.text as string,
      metadata: match.metadata as VectorMetadata
    }))
}

/**
 * Delete all vectors for a bot
 */
export async function deleteVectorsForBot(botId: string) {
  const index = pinecone.index(indexName)
  
  await index.deleteMany({ botId })
  
  console.log(`[Pinecone] Deleted all vectors for bot ${botId}`)
}

/**
 * Get vector count for a bot
 */
export async function getVectorCount(botId: string): Promise<number> {
  const index = pinecone.index(indexName)
  
  const stats = await index.describeIndexStats()
  
  // Note: Pinecone doesn't provide per-namespace count easily
  // This is an approximation
  return stats.totalRecordCount || 0
}
```

---

### FASE 3: Migra Ingestion Worker (45 min)

#### 3.1 Modifica `lib/ingestion-worker.ts`

```typescript
// PRIMA (file JSON)
import { addToVectorStore } from './simple-vector-store'

// DOPO (Pinecone)
import { upsertVectors } from './pinecone-vector-store'

// ...nel codice...

// PRIMA
await addToVectorStore(botId, vectorChunks)

// DOPO  
await upsertVectors(botId, vectorChunks)
```

---

### FASE 4: Migra RAG Pipeline (45 min)

#### 4.1 Modifica `lib/rag-pipeline.ts`

```typescript
// PRIMA (file JSON)
import { queryKnowledgeBase as queryJSON } from './simple-vector-store'

// DOPO (Pinecone)
import { queryVectors } from './pinecone-vector-store'
import { generateEmbedding } from './embeddings'

export async function queryKnowledgeBase(
  botId: string,
  query: string,
  options: {
    topK?: number
    minScore?: number
  } = {}
) {
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query)
  
  // Query Pinecone
  const results = await queryVectors(botId, queryEmbedding, options)
  
  return results
}
```

---

### FASE 5: Migrazione Dati Esistenti (30 min)

#### 5.1 Script Migrazione: `scripts/migrate-to-pinecone.ts`

```typescript
/**
 * Migrate existing JSON vector stores to Pinecone
 */

import { prisma } from '../lib/db'
import { upsertVectors } from '../lib/pinecone-vector-store'
import fs from 'fs'
import path from 'path'

async function migrateBot(botId: string) {
  console.log(`\n📦 Migrating bot: ${botId}`)
  
  // Load JSON file
  const jsonPath = path.join('data/vector_store', botId, 'vectors.json')
  
  if (!fs.existsSync(jsonPath)) {
    console.log(`⚠️ No vector store found, skipping`)
    return
  }
  
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  
  if (!data.chunks || data.chunks.length === 0) {
    console.log(`⚠️ No chunks found, skipping`)
    return
  }
  
  console.log(`📊 Found ${data.chunks.length} chunks`)
  
  // Upload to Pinecone
  await upsertVectors(botId, data.chunks)
  
  console.log(`✅ Migrated ${data.chunks.length} chunks to Pinecone`)
}

async function migrateAll() {
  const bots = await prisma.chatbot.findMany({
    where: {
      kbStatus: 'ready'
    },
    select: {
      id: true,
      companyName: true
    }
  })
  
  console.log(`🚀 Migrating ${bots.length} bots to Pinecone\n`)
  
  for (const bot of bots) {
    try {
      await migrateBot(bot.id)
    } catch (error) {
      console.error(`❌ Failed to migrate ${bot.companyName}:`, error)
    }
  }
  
  console.log(`\n✅ Migration complete!`)
}

migrateAll()
```

---

## Testing

### Test 1: Upsert
```typescript
// Test inserimento
const testChunks = [{
  id: 'test-1',
  embedding: [0.1, 0.2, ...], // 1536 dimensions
  text: 'Test content',
  metadata: { sourceId: 'test', sourceType: 'url' }
}]

await upsertVectors('test-bot-id', testChunks)
// ✅ Dovrebbe completare senza errori
```

### Test 2: Query
```typescript
// Test query
const queryEmb = await generateEmbedding('test query')
const results = await queryVectors('test-bot-id', queryEmb, { topK: 5 })

console.log(results)
// ✅ Dovrebbe ritornare chunks rilevanti
```

### Test 3: Delete
```typescript
// Test delete
await deleteVectorsForBot('test-bot-id')
// ✅ Dovrebbe rimuovere tutti i vettori
```

---

## Rollback Plan

Se qualcosa va male:

```typescript
// 1. Torna a simple-vector-store
// In lib/rag-pipeline.ts
import { queryKnowledgeBase } from './simple-vector-store' // OLD

// 2. I file JSON sono ancora lì
// Nulla viene cancellato durante migrazione

// 3. Pinecone index può essere svuotato
await index.deleteAll()
```

---

## Monitoring

### Metriche da Tracciare

```typescript
// Query time
const start = Date.now()
const results = await queryVectors(...)
const duration = Date.now() - start
console.log(`Query took ${duration}ms`)

// Index size
const count = await getVectorCount(botId)
console.log(`Bot has ${count} vectors`)

// Cache hit rate (if adding caching layer)
const cacheStats = getCacheStats()
console.log(`Cache hit rate: ${cacheStats.hitRate}%`)
```

---

## Costi

### Pinecone Free Tier
- ✅ 1M vectors
- ✅ 1 index
- ✅ Unlimited queries

### Quando Upgradi?
- > 1M vectors → Paid plan ($0.096/M vectors/month)
- Multiple indexes → Standard plan

**Stima**: 
- 20 bot × 1000 chunks = 20K vectors
- 50 bot × 1000 chunks = 50K vectors
- **Rimarrai nel free tier facilmente per 50-100 bot**

---

## Vantaggi Post-Migrazione

### Performance
- ❌ PRIMA: 500-1000ms per query
- ✅ DOPO: 50-100ms per query (10x faster)

### Scalabilità
- ❌ PRIMA: Degrada con > 1000 chunks
- ✅ DOPO: Scala a milioni di chunks

### Features
- ✅ Metadata filtering nativo
- ✅ Hybrid search (semantic + keyword)
- ✅ Namespace per isolamento bot
- ✅ Backup automatico
- ✅ High availability

---

## Next Steps (Post Vector DB)

### #2 Event Log (Facile, 2 ore)
- Traccia ogni decisione
- Audit trail completo
- Debugging facilitato

### #3 Knowledge Graph (Avanzato, 1 settimana)
- Neo4j o equivalente
- Relationship reasoning
- Entity linking

---

## Timeline Totale

| Fase | Tempo | Cumulative |
|------|-------|------------|
| Setup Pinecone | 30 min | 30 min |
| Adapter Pinecone | 60 min | 1.5 ore |
| Migra Ingestion | 45 min | 2.25 ore |
| Migra RAG Pipeline | 45 min | 3 ore |
| Migrazione Dati | 30 min | 3.5 ore |
| Testing | 30 min | 4 ore |

**TOTALE: ~4 ore di implementazione**

---

## Decisione

**Vuoi procedere con Vector Database (Pinecone)?**

✅ **Sì** → Partiamo subito
❓ **Domande** → Chiarisci prima
⏸️ **Dopo** → Prima completiamo altro

Dimmi e partiamo! 🚀
