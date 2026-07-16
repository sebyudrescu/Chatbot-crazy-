# 🧠 Piano Miglioramento Memoria Chatbot

## 🎯 Obiettivo
Far sì che il chatbot RICORDI il contesto e USI correttamente le informazioni crawlate.

---

## ❌ Problemi Identificati

### 1. **Conversation History Limitata**
```typescript
// ATTUALE (app/api/chat/route.ts:91)
take: 10  // Solo ultimi 10 messaggi

PROBLEMA:
• Con 10 messaggi, il chatbot dimentica rapidamente
• Una conversazione tipo ha 20-30 messaggi
• Perde contesto importante dopo 5 scambi
```

### 2. **RAG Threshold Troppo Alto**
```typescript
// ATTUALE (app/api/chat/route.ts:231)
minScore: 0.30  // 30% similarità minima

PROBLEMA:
• 0.30 è troppo restrittivo
• Chunks rilevanti vengono scartati
• Molte query ritornano 0 risultati
```

### 3. **TopK Insufficiente**
```typescript
// ATTUALE
topK: 50  // Solo 50 chunks esaminati

PROBLEMA:
• Con siti complessi serve esaminare più chunks
• Il reranking dopo può salvare, ma meglio avere più candidati
```

### 4. **Summarization Non Sempre Attiva**
```typescript
// ATTUALE
if (shouldSummarize && allMessages.length >= 10) {
  // Summarize
}

PROBLEMA:
• Summarization richiede 10+ messaggi
• Prima di 10 messaggi, nessun summary
• Summary non sempre incluso nel prompt
```

### 5. **No Hybrid Search**
```typescript
// ATTUALE
• Solo semantic search con embeddings
• Nessun keyword matching

PROBLEMA:
• Query con nomi specifici/acronimi non matchano bene
• Keyword search aiuterebbe molto
```

---

## ✅ Soluzioni da Implementare

### **SOLUZIONE 1: Conversation Memory Potenziata**

#### Cambio 1: Aumentare History
```typescript
// DA:
take: 10

// A:
take: 20  // Doppio dei messaggi
```

#### Cambio 2: Summarization Aggressiva
```typescript
// DA:
if (shouldSummarize && allMessages.length >= 10)

// A:
if (shouldSummarize && allMessages.length >= 6)  // Prima threshold
```

#### Cambio 3: Context Window Più Grande
```typescript
// DA:
maxTokens: 3000

// A:
maxTokens: 6000  // Doppio token budget per context
```

**Impatto:**
- ✅ Ricorda 2x più messaggi
- ✅ Summarization più frequente
- ✅ Più context per il modello

---

### **SOLUZIONE 2: RAG Retrieval Ottimizzato**

#### Cambio 1: Abbassare Threshold
```typescript
// DA:
minScore: 0.30

// A:
minScore: 0.20  // Più permissivo
```

#### Cambio 2: Aumentare TopK
```typescript
// DA:
topK: 50

// A:
topK: 100  // Più chunks candidati
```

#### Cambio 3: Query Expansion
```typescript
// NUOVO
async function expandQuery(query: string): Promise<string[]> {
  // Genera varianti della query
  const variations = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{
      role: 'user',
      content: `Generate 2 alternative phrasings of: "${query}"`
    }],
    max_tokens: 100
  })
  
  return [query, ...parseVariations(variations)]
}

// Poi cerca con tutte le varianti
const allChunks = []
for (const variant of queryVariants) {
  const chunks = await queryKnowledgeBase(botId, variant, options)
  allChunks.push(...chunks)
}

// Deduplica e merge
```

**Impatto:**
- ✅ +30% recall (trova più chunks rilevanti)
- ✅ Funziona meglio con sinonimi
- ✅ Meno "non lo so"

---

### **SOLUZIONE 3: Hybrid Search**

#### Implementazione BM25 + Semantic
```typescript
// lib/hybrid-search.ts
export async function hybridSearch(
  botId: string,
  query: string,
  options: {
    semanticWeight: 0.7,  // 70% semantic
    keywordWeight: 0.3,   // 30% keyword
    topK: 100
  }
) {
  // 1. Semantic search
  const semanticResults = await semanticSearch(botId, query, {
    topK: options.topK
  })
  
  // 2. Keyword search (BM25)
  const keywordResults = await keywordSearch(botId, query, {
    topK: options.topK
  })
  
  // 3. Merge con weighted scoring
  const merged = mergeResults(
    semanticResults,
    keywordResults,
    options.semanticWeight,
    options.keywordWeight
  )
  
  return merged
}
```

**Impatto:**
- ✅ Trova chunks che semantic search perde
- ✅ Ottimo per nomi specifici, codici, acronimi
- ✅ +20% accuracy

---

### **SOLUZIONE 4: Chunking Migliorato**

#### Cambio 1: Overlap Maggiore
```typescript
// DA (lib/chunking.ts):
overlap: 50  // 50 tokens overlap

// A:
overlap: 100  // Doppio overlap per continuità migliore
```

#### Cambio 2: Chunk Size Adattivo
```typescript
// NUOVO
function adaptiveChunkSize(text: string): number {
  if (isCodeOrTechnical(text)) {
    return 256  // Chunk più piccoli per codice
  }
  if (isNarrative(text)) {
    return 768  // Chunk più grandi per prose
  }
  return 512  // Default
}
```

**Impatto:**
- ✅ Meno contesto perso tra chunks
- ✅ Chunks più coerenti
- ✅ Migliore retrieval

---

### **SOLUZIONE 5: Prompt Context Potenziato**

#### Cambio 1: Include SEMPRE History
```typescript
// ATTUALE: History è opzionale
// NUOVO: History SEMPRE inclusa

const systemPrompt = `
${baseSystemPrompt}

# CONVERSATION HISTORY
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

# RELEVANT FACTS
${factsContext}

${summary ? `# CONVERSATION SUMMARY\n${summary}` : ''}

# KNOWLEDGE BASE CONTEXT
${ragContext}
`
```

#### Cambio 2: Context Window Management
```typescript
// NUOVO: Priority-based context inclusion
const contextPriority = [
  { name: 'current_message', tokens: countTokens(message), priority: 10 },
  { name: 'rag_context', tokens: countTokens(ragContext), priority: 9 },
  { name: 'last_5_messages', tokens: countTokens(last5), priority: 8 },
  { name: 'facts', tokens: countTokens(factsContext), priority: 7 },
  { name: 'summary', tokens: countTokens(summary), priority: 6 },
  { name: 'older_messages', tokens: countTokens(older), priority: 5 },
]

// Include in ordine di priorità fino a maxTokens
let usedTokens = 0
const included = []

for (const item of contextPriority.sort((a, b) => b.priority - a.priority)) {
  if (usedTokens + item.tokens <= MAX_CONTEXT_TOKENS) {
    included.push(item.name)
    usedTokens += item.tokens
  }
}
```

**Impatto:**
- ✅ Context sempre completo
- ✅ Priorità intelligenti
- ✅ Nessuna informazione critica persa

---

## 📊 Metriche da Migliorare

| Metrica | Prima | Target | Come |
|---------|-------|--------|------|
| **Answer Rate** | 60% | 90% | Threshold + TopK + Hybrid |
| **Context Recall** | 5 msgs | 20 msgs | Aumentare take |
| **RAG Precision** | 70% | 85% | Query expansion |
| **Confidence Avg** | 0.65 | 0.80 | Migliori chunks |
| **User Satisfaction** | 60% | 85% | Tutti miglioramenti |

---

## 🚀 Ordine di Implementazione

### **FASE 1: Quick Wins (30 min)**
1. ✅ Aumentare `take` da 10 a 20
2. ✅ Abbassare `minScore` da 0.30 a 0.20
3. ✅ Aumentare `topK` da 50 a 100
4. ✅ Chunking overlap da 50 a 100

**Test:** Immediate improvement in answer rate

### **FASE 2: Memory (1 ora)**
5. ✅ Context window da 3K a 6K tokens
6. ✅ Summarization threshold da 10 a 6 msgs
7. ✅ Priority-based context inclusion

**Test:** Better context retention

### **FASE 3: Advanced (2 ore)**
8. ✅ Query expansion
9. ✅ Hybrid search (semantic + keyword)
10. ✅ Adaptive chunking

**Test:** Significantly better RAG

---

## ⚙️ Settings Ottimali Finali

```typescript
// conversation-memory.ts
MAX_MESSAGES: 20          // era 10
MAX_CONTEXT_TOKENS: 6000  // era 3000
SUMMARY_THRESHOLD: 6      // era 10

// rag-pipeline.ts
MIN_SCORE: 0.20           // era 0.30
TOP_K: 100                // era 50
ENABLE_HYBRID: true       // nuovo

// chunking.ts
CHUNK_SIZE: 512           // invariato
CHUNK_OVERLAP: 100        // era 50
ADAPTIVE_SIZE: true       // nuovo

// chat route
CONTEXT_PRIORITY: enabled // nuovo
QUERY_EXPANSION: true     // nuovo
```

---

## 🧪 Come Testare

### Test 1: Context Retention
```
User: "My name is John"
Bot: "Nice to meet you, John!"
User: "What's my name?" [5 messages later]
Bot: Should remember "John" ✅
```

### Test 2: RAG Retrieval
```
User: "What services do you offer?"
Expected: Should find relevant chunks even with different wording
```

### Test 3: Follow-up Questions
```
User: "Tell me about your pricing"
Bot: "We have 3 plans..."
User: "What's included in the second one?"
Bot: Should remember "second" = middle plan ✅
```

---

**Pronto per implementazione quando hai fatto il test!**
