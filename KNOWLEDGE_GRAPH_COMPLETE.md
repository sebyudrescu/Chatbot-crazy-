# 🕸️ KNOWLEDGE GRAPH - IMPLEMENTAZIONE COMPLETA

## ✅ STATO: COMPLETATO E INTEGRATO

Data: 6 Gennaio 2026  
Tempo implementazione: ~2 ore

---

## 🎯 OBIETTIVO

Implementare il **Layer 3** dell'architettura completa: un sistema di Knowledge Graph per rappresentare entità e relazioni esplicite, permettendo al chatbot di ragionare su connessioni che la similarità semantica da sola non può catturare.

---

## 📊 COSA È STATO IMPLEMENTATO

### 1. **Schema Database (Prisma)** ✅

**File**: `prisma/schema.prisma`

Aggiunti 2 nuovi modelli:

#### `Entity` - Entità del grafo
- Classificazione: `entityType` (product, service, person, company, feature, location, concept)
- Nome normalizzato: `entityName` 
- Aliases per matching: `aliases` (JSON array)
- Attributi: `attributes` (JSON object)
- Descrizione e categoria
- Embedding per semantic search
- Confidence e source tracking
- Temporal management (createdAt, updatedAt, isActive)
- Metadata e tags

#### `Relation` - Relazioni tra entità
- Triple: `(sourceEntity) --[relationType]--> (targetEntity)`
- Tipi di relazione: HAS_FEATURE, PART_OF, COMPATIBLE_WITH, COSTS, REQUIRES, REPLACES, ecc.
- Attributi della relazione
- Strength (0-1) e bidirectional flag
- Confidence e source tracking
- Temporal validity (validFrom, validUntil)

**Indexes ottimizzati** per query veloci su:
- botId, entityType, entityName, category
- sourceEntityId, targetEntityId, relationType
- isActive, temporal fields

---

### 2. **Knowledge Graph Manager** ✅

**File**: `lib/knowledge-graph.ts` (~700 righe)

#### Funzionalità Principali:

**Entity Management:**
- `upsertEntity()` - Crea/aggiorna entità con embedding automatico
- `findEntity()` - Trova entità per nome (exact o alias match)
- `getEntity()` - Get by ID
- `findEntitiesByType()` - Filtra per tipo
- `searchEntities()` - Semantic search con embeddings

**Relation Management:**
- `upsertRelation()` - Crea/aggiorna relazioni
- `getEntityRelations()` - Ottieni relazioni di un'entità (outgoing/incoming/both)
- `getRelatedEntities()` - Ottieni entità connesse (1-hop)

**Graph Queries & Reasoning:**
- `findPath()` - BFS per trovare percorso tra due entità (max depth configurabile)
- `findEntitiesWithRelation()` - Query tipo "Quali prodotti hanno feature X?"
- `getEntityNeighborhood()` - Esplora vicinato (N-hops)
- `queryGraph()` - Query in linguaggio naturale con semantic search

---

### 3. **Entity Extractor** ✅

**File**: `lib/entity-extractor.ts` (~500 righe)

#### Estrazione Automatica:

**Da Knowledge Base:**
- `extractFromKnowledgeBase()` - Estrae entità e relazioni da documenti
- Usa GPT-4o-mini con prompt strutturato
- Chunking intelligente per testi lunghi (max 4000 chars)
- Entity normalization e deduplication
- Gestione aliases automatica

**Da Conversazioni:**
- `extractFromConversation()` - Estrae menzioni e preferenze utente
- Focus su entità user-related
- Confidence leggermente ridotta (×0.9)
- Tagging automatico (`from_conversation`)

**Utility Functions:**
- `extractEntityMentions()` - Quick regex-based extraction
- `linkUserToEntity()` - Collega user a entità (INTERESTED_IN, PREFERS, OWNS, DISLIKES)

**Tipi di Entità Estratte:**
- product, service, feature, person, company, location, concept

**Tipi di Relazioni Estratte:**
- HAS_FEATURE, PART_OF, COMPATIBLE_WITH, COSTS, REQUIRES, REPLACES, WORKS_WITH, LOCATED_AT

---

### 4. **Integrazione Decision Orchestrator** ✅

**File**: `lib/decision-orchestrator.ts` (modificato)

#### Nuove Capacità:

**Enhanced Decision Making:**
- `detectRelationalQuery()` - Rileva domande che chiedono connessioni
- Nuova strategia: `graph_reasoning` per query relazionali
- `shouldUseGraph` flag per attivare graph retrieval

**Graph Retrieval Phase (3.5):**
- Eseguita dopo retrieval standard se `shouldUseGraph = true`
- Query del grafo con linguaggio naturale
- Logging dettagliato (entità, relazioni, reasoning)
- Error handling con fallback

**Enhanced Response Generation:**
- `formatGraphForPrompt()` - Formatta entità e relazioni per LLM
- Aggiunge contesto strutturato al system prompt
- Raggruppa relazioni per tipo
- Mostra attributi e metadati

**Relational Query Detection:**
Keywords rilevati:
- quali, cosa, come, differenza, confronto
- ha, hanno, include, contiene, compatibile
- caratteristiche, feature, proprietà
- prezzo, costo, quanto
- sostituisce, aggiorna, migliore

---

### 5. **Script Utilities** ✅

#### `scripts/populate-knowledge-graph.ts`
Popola il grafo da knowledge base esistente:
```bash
npx ts-node scripts/populate-knowledge-graph.ts <botId>
```

Funzionalità:
- Processa tutti i knowledge sources completati
- Estrae entità e relazioni con LLM
- Progress logging dettagliato
- Statistiche finali (entity types distribution)

#### `scripts/test-knowledge-graph.ts`
Test completo del sistema:
```bash
npx ts-node scripts/test-knowledge-graph.ts <botId>
```

Tests:
1. Create sample entities (iPhone 15 Pro, USB-C, Titanium)
2. Create relations (HAS_FEATURE)
3. Find entity by name
4. Semantic search
5. Get related entities
6. Find path between entities
7. Natural language graph query

---

## 🚀 COME FUNZIONA

### Flusso Completo:

```
User Query: "Quali sono le caratteristiche dell'iPhone 15 Pro?"
    ↓
1. UNDERSTANDING
   - Intent: question
   - Entities: ["iPhone 15 Pro"]
   - Relational query: YES (keyword "caratteristiche")
    ↓
2. DECISION
   - Strategy: graph_reasoning
   - shouldUseGraph: true
   - Sources: [knowledge_graph, knowledge_base]
    ↓
3. RETRIEVAL
   3a. Standard RAG (persistent + KB)
   3b. Knowledge Graph Query
       - Semantic search per "iPhone 15 Pro"
       - Trova entità nel grafo
       - Ottieni relazioni (HAS_FEATURE)
       - Ritorna entità connesse
    ↓
4. VALIDATION
   - Coerenza tra fonti
   - Cross-check graph vs KB
    ↓
5. GENERATION
   - System prompt con:
     * Context RAG standard
     * Entità e relazioni dal grafo
     * Attributi strutturati
   - LLM genera risposta usando info strutturate
    ↓
6. LEARNING
   - Estrai nuove entità menzionate
   - Salva preferenze utente
   - Aggiorna relazioni
```

---

## 📈 VANTAGGI DEL KNOWLEDGE GRAPH

### Prima (Solo RAG Semantico):
```
Query: "Quali prodotti hanno USB-C?"
Problema: Similarità semantica trova menzioni di USB-C, 
         ma non sa quali prodotti lo hanno realmente
Risposta: Vaga, basata su inferenze
```

### Dopo (Con Knowledge Graph):
```
Query: "Quali prodotti hanno USB-C?"
Processo: 
  1. Trova entità "USB-C" nel grafo
  2. Query relazioni inverse: ?product --[HAS_FEATURE]--> USB-C
  3. Ottiene lista esatta di prodotti
Risposta: Precisa, basata su fatti strutturati
```

### Casi d'Uso Perfetti:

1. **Confronti**: "Differenza tra iPhone 15 e 15 Pro?"
   - Trova entrambe entità
   - Confronta attributi e relazioni
   
2. **Caratteristiche**: "Cosa include il piano Premium?"
   - Query HAS_FEATURE da Premium
   - Lista esatta di feature

3. **Compatibilità**: "iPhone 15 funziona con AirPods Pro?"
   - Cerca relazione COMPATIBLE_WITH
   - Risposta certa sì/no

4. **Prezzi**: "Quanto costa iPhone 15 Pro?"
   - Attributo diretto nell'entità
   - Nessuna ambiguità

5. **Relazioni complesse**: "Cosa sostituisce iPhone 15?"
   - Query REPLACES relations
   - Path finding nel grafo

---

## 🔄 INTEGRAZIONE CON SISTEMA ESISTENTE

### Layer Interoperability:

```
┌─────────────────────────────────────────────┐
│         USER QUERY                          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│      DECISION ORCHESTRATOR                  │
│  (Decide quali layer usare)                 │
└─────────────────────────────────────────────┘
         ↓           ↓           ↓
    ┌────────┐  ┌────────┐  ┌─────────────┐
    │ Memory │  │   KB   │  │ Graph (NEW) │
    │(Prisma)│  │(Vector)│  │  (Prisma)   │
    └────────┘  └────────┘  └─────────────┘
         ↓           ↓           ↓
    ┌─────────────────────────────────────┐
    │    COHERENCE VALIDATOR              │
    │  (Cross-check tra fonti)            │
    └─────────────────────────────────────┘
                    ↓
         ┌────────────────────┐
         │  LLM GENERATION    │
         └────────────────────┘
```

### Non Sostituisce, Complementa:

- **Memory (StructuredFacts)**: Per preferenze, profilo utente, storico
- **Vector DB**: Per similarità semantica, documenti, testo libero
- **Knowledge Graph**: Per relazioni esplicite, entità strutturate, reasoning

**Usati insieme = Sistema completo**

---

## 🧪 TESTING

### Test Automatico:
```bash
# Popola grafo da KB esistente
npx ts-node scripts/populate-knowledge-graph.ts <botId>

# Testa tutte le funzionalità
npx ts-node scripts/test-knowledge-graph.ts <botId>
```

### Test Manuale via Chat:

**Query Relazionali:**
- "Quali sono le caratteristiche di [prodotto]?"
- "Cosa include [servizio]?"
- "[Prodotto A] è compatibile con [Prodotto B]?"
- "Quanto costa [prodotto]?"
- "Qual è la differenza tra [A] e [B]?"

**Aspettati:**
- Risposte precise basate su relazioni
- Citazione di attributi strutturati
- Nessuna "allucinazione" su relazioni

---

## 📊 METRICHE E MONITORING

### Database Stats:
```sql
-- Conta entità per bot
SELECT COUNT(*) FROM entities WHERE botId = '<botId>';

-- Distribuzione tipi entità
SELECT entityType, COUNT(*) 
FROM entities 
WHERE botId = '<botId>' 
GROUP BY entityType;

-- Relazioni più usate
SELECT relationType, COUNT(*) 
FROM relations 
WHERE botId = '<botId>' 
GROUP BY relationType 
ORDER BY COUNT(*) DESC;
```

### Application Metrics:
- Graph query latency (< 100ms target)
- Entity match accuracy
- Relation confidence scores
- Graph coverage (% queries using graph)

---

## 🔧 CONFIGURAZIONE

### Quando il Grafo Viene Usato:

Automaticamente attivato se:
1. Query contiene entità riconosciute
2. Query ha pattern relazionale (caratteristiche, confronto, ecc.)
3. `shouldUseGraph = true` nel Decision Orchestrator

### Controllo Manuale:

```typescript
// In orchestrateResponse context
const decision = makeDecision({
  intent,
  queryClassification,
  entities,
  topics,
  conversationLength
})

// decision.shouldUseGraph sarà true se appropriato
```

---

## 🎓 BEST PRACTICES

### 1. **Entity Naming**
- Sempre normalizzato: "iPhone 15 Pro" non "iphone 15 pro"
- Usa displayName per user-friendly labels
- Aggiungi aliases per varianti comuni

### 2. **Relation Types**
- Usa nomi descrittivi: HAS_FEATURE non HAS
- Consistenti nel dominio: sempre HAS_FEATURE, mai HAS_CHARACTERISTIC
- Documenta nuovi tipi quando aggiunti

### 3. **Confidence Scores**
- Estratte da KB: 0.9-1.0
- Estratte da conversation: 0.7-0.9
- Inferite: 0.5-0.7
- Mai < 0.5 (scarta)

### 4. **Temporal Management**
- Usa validUntil per fatti time-bound (es: prezzi)
- isActive = false invece di delete
- Auditable: mantieni storico

### 5. **Performance**
- Embeddings pre-calcolati alla creazione
- Indexes su tutti i campi di query
- Limita depth search (max 3-4 hops)
- Cache frequent queries

---

## 🚧 LIMITAZIONI ATTUALI

1. **No Neo4j**: Usiamo Prisma (relazionale), non grafo nativo
   - Pro: Più semplice, integrato, zero infra
   - Con: Query graph complesse meno performanti

2. **Extraction Quality**: Dipende da LLM
   - GPT-4o-mini è buono ma non perfetto
   - Possibili false positives/negatives
   - Confidence score aiuta a filtrare

3. **Cold Start**: Grafo vuoto inizialmente
   - Serve popolazione da KB esistente
   - Incrementale con conversazioni
   - Considera seeding manuale per domini specifici

4. **Scalability**: SQLite limits
   - OK per 10K entities
   - Per >100K considera PostgreSQL + pgvector
   - O migrazione a Neo4j

---

## 🔮 FUTURE ENHANCEMENTS

### Fase Successiva (se necessario):

1. **Neo4j Migration**
   - Per graph-native performance
   - Query Cypher più espressive
   - Visualizzazioni built-in

2. **Entity Resolution**
   - Merge duplicati automaticamente
   - Disambiguazione (Apple azienda vs apple frutto)
   - Entity linking a knowledge bases esterne

3. **Relation Inference**
   - Inferisci relazioni transitiva (A->B, B->C => A->C)
   - ML-based relation prediction
   - Confidence propagation

4. **Graph Embeddings**
   - Node2Vec per entity embeddings
   - Graph Neural Networks
   - Better semantic matching

5. **Visual Graph Explorer**
   - UI per navigare grafo
   - Drag-and-drop relation builder
   - Export/import graph data

---

## ✅ CHECKLIST COMPLETAMENTO

- [x] Schema Prisma con Entity e Relation
- [x] Database migrato con successo
- [x] Knowledge Graph Manager (CRUD operations)
- [x] Entity Extractor con LLM
- [x] Graph Query Engine (path finding, neighborhood)
- [x] Integrazione con Decision Orchestrator
- [x] Relational query detection
- [x] Graph context formatting per LLM
- [x] Script popolamento da KB
- [x] Script testing completo
- [x] Documentazione completa
- [x] Logging e error handling
- [x] Performance indexes

---

## 🎯 RISULTATO FINALE

**Il sistema ora ha 3 layer completamente integrati:**

1. ✅ **Relational DB (Prisma)** - Stato, memoria, audit
2. ✅ **Vector DB (Pinecone/FAISS)** - Similarità semantica
3. ✅ **Knowledge Graph (Prisma)** - Relazioni esplicite

**Il chatbot può ora:**
- ✅ Ragionare su relazioni tra entità
- ✅ Rispondere a domande strutturali precise
- ✅ Confrontare prodotti/servizi con dati certi
- ✅ Evitare allucinazioni su caratteristiche
- ✅ Personalizzare basandosi su grafo + memoria
- ✅ Apprendere nuove entità e relazioni automaticamente

---

## 📞 PROSSIMI PASSI

**Opzione A**: Testare con bot reale
```bash
# 1. Scegli un bot con KB popolata
# 2. Popola il grafo
npx ts-node scripts/populate-knowledge-graph.ts <botId>

# 3. Testa query relazionali via chat
# "Quali caratteristiche ha [prodotto]?"
# "Confronta [A] con [B]"
```

**Opzione B**: Implementare Layer 4 (Event Log / Audit Trail)
- Tracking decisioni orchestrator
- Timeline eventi per debugging
- Analytics avanzate

**Opzione C**: Ottimizzazioni e UI
- Dashboard visualizzazione grafo
- Manual entity/relation management
- Performance monitoring

---

**Dimmi quale direzione preferisci!** 🚀
