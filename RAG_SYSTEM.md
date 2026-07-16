# 🧠 Sistema RAG - Documentazione Completa

## 📋 Panoramica

Il sistema RAG (Retrieval-Augmented Generation) permette ai chatbot di rispondere alle domande degli utenti usando **solo le informazioni caricate** (URL e PDF), evitando allucinazioni e risposte basate su conoscenza generica.

---

## 🎯 Come Funziona

### **Flusso Completo**

```
1. ADMIN → Carica PDF/URL
   ↓
2. SISTEMA → Estrae testo
   ↓
3. SISTEMA → Divide in chunks (1000 chars, overlap 200)
   ↓
4. SISTEMA → Genera embeddings (OpenAI ada-002)
   ↓
5. SISTEMA → Salva in FAISS index per bot
   ↓
6. UTENTE → Fa domanda al chatbot
   ↓
7. SISTEMA → Converte domanda in embedding
   ↓
8. SISTEMA → Cerca chunks simili (top 5, similarità > 0.7)
   ↓
9. SISTEMA → Passa chunks a GPT-3.5-turbo
   ↓
10. GPT → Genera risposta SOLO da chunks
   ↓
11. UTENTE → Riceve risposta + fonti citate
```

---

## 🏗️ Architettura

### **1. Storage Layer**

```
data/
├── faiss_indices/
│   └── {bot_id}/
│       ├── index.faiss          # FAISS vector index
│       ├── metadata.json        # Index metadata
│       └── documents.json       # Document chunks + metadata
└── uploads/
    └── {bot_id}/
        └── {source_id}.pdf      # Original PDF files
```

### **2. Core Modules**

#### **`lib/embeddings.ts`**
- ✅ `generateEmbedding(text)` - Generate OpenAI embeddings
- ✅ `chunkText(text, size, overlap)` - Split text into chunks

#### **`lib/chunking.ts`**
- ✅ `chunkTextSmart()` - Sentence-aware chunking
- ✅ `chunkByParagraphs()` - Paragraph-based splitting
- ✅ `chunkTextAuto()` - Auto-select best strategy

#### **`lib/document-processors.ts`**
- ✅ `extractTextFromPDF(buffer)` - Extract text from PDF
- ✅ `extractTextFromURL(url)` - Scrape and clean HTML
- ✅ `validateURL(url)` - Check URL accessibility

#### **`lib/vector-store.ts`**
- ✅ `createIndex()` - Create new FAISS index
- ✅ `addVectors()` - Add embeddings to index
- ✅ `searchVectors()` - Semantic search
- ✅ `saveIndex()` - Persist to disk
- ✅ `loadIndex()` - Load from disk
- ✅ `deleteIndex()` - Remove index

#### **`lib/rag-pipeline.ts`**
- ✅ `processAndStoreDocument()` - Full processing pipeline
- ✅ `queryKnowledgeBase()` - Search relevant chunks
- ✅ `generateRAGResponse()` - Generate response with context

---

## 🚀 API Endpoints

### **Upload PDF**

```bash
POST /api/knowledge-sources/upload-pdf
Content-Type: multipart/form-data

Body:
- file: PDF file (max 10MB)
- botId: UUID

Response:
{
  "success": true,
  "data": {
    "sourceId": "uuid",
    "filename": "document.pdf",
    "textLength": 15000,
    "status": "processing"
  }
}
```

### **Add URL**

```bash
POST /api/knowledge-sources/add-url
Content-Type: application/json

Body:
{
  "botId": "uuid",
  "url": "https://example.com/page"
}

Response:
{
  "success": true,
  "data": {
    "sourceId": "uuid",
    "url": "https://example.com/page",
    "textLength": 8000,
    "status": "processing"
  }
}
```

### **List Sources**

```bash
GET /api/knowledge-sources?botId={uuid}&status=completed

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "sourceType": "pdf",
      "originalFilename": "manual.pdf",
      "status": "completed",
      "chunkCount": 25,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### **Delete Source**

```bash
DELETE /api/knowledge-sources?sourceId={uuid}&botId={uuid}

Response:
{
  "success": true,
  "message": "Knowledge source deleted successfully"
}
```

### **Chat with RAG**

```bash
POST /api/chat
Content-Type: application/json

Body:
{
  "botId": "uuid",
  "message": "What are your business hours?",
  "conversationId": "uuid" // optional
}

Response:
{
  "success": true,
  "data": {
    "conversationId": "uuid",
    "assistantMessage": {
      "content": "Secondo la Fonte 1, siamo aperti dal lunedì al venerdì, 9-18.",
      "createdAt": "2024-01-01T00:00:00Z"
    },
    "sources": [
      {
        "id": "uuid",
        "sourceType": "pdf",
        "originalFilename": "faq.pdf"
      }
    ],
    "relevantChunks": 3
  }
}
```

---

## ⚙️ Configurazione

### **Parametri Chunking**

```typescript
{
  chunkSize: 1000,        // caratteri per chunk
  overlap: 200,           // overlap tra chunks
  method: "auto",         // auto, smart, paragraph, simple
}
```

### **Parametri Retrieval**

```typescript
{
  topK: 5,                // Numero chunks da recuperare
  minScore: 0.7,          // Soglia similarità minima (0-1)
  maxContextLength: 4000, // Max caratteri nel contesto
}
```

### **OpenAI Models**

```typescript
{
  embeddings: "text-embedding-ada-002",  // $0.0001/1K tokens
  llm: "gpt-3.5-turbo",                 // $0.002/1K tokens
  temperature: 0.3,                      // Più deterministico
  maxTokens: 500,                       // Lunghezza risposta
}
```

---

## 📊 Database Schema

```prisma
model KnowledgeSource {
  id              String   @id
  botId           String
  sourceType      String   // "url" | "pdf"
  sourceUrl       String?
  originalFilename String?
  contentText     String   // Testo estratto
  processedAt     DateTime?
  status          String   // "processing" | "completed" | "failed"
  chunkCount      Int      @default(0)
  errorMessage    String?
  createdAt       DateTime
  
  chatbot         Chatbot  @relation(...)
}
```

---

## 🧪 Testing

### **Test 1: Upload PDF**

```bash
curl -X POST http://localhost:3000/api/knowledge-sources/upload-pdf \
  -F "file=@./test.pdf" \
  -F "botId=YOUR_BOT_ID"
```

### **Test 2: Add URL**

```bash
curl -X POST http://localhost:3000/api/knowledge-sources/add-url \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "YOUR_BOT_ID",
    "url": "https://example.com"
  }'
```

### **Test 3: Chat Query**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "YOUR_BOT_ID",
    "message": "What is your refund policy?"
  }'
```

---

## 💡 Best Practices

### **✅ DO**

1. **Chunking Intelligente**
   - Usa `chunkTextAuto()` per scelta automatica
   - Preserva contesto semantico
   - Mantieni overlap per continuità

2. **Quality Control**
   - Valida URL prima di processare
   - Controlla lunghezza testo estratto (min 100 chars)
   - Gestisci errori con retry logic

3. **Performance**
   - Rate limiting su OpenAI (100ms tra chiamate)
   - Carica indici FAISS on-demand
   - Usa background processing per documenti grandi

4. **User Experience**
   - Mostra status processing in real-time
   - Cita fonti nelle risposte
   - Fallback graceful se no risultati

### **❌ DON'T**

1. Non usare chunks troppo piccoli (< 200 chars)
2. Non salvare tutto in un chunk gigante
3. Non processare documenti in modo sincrono
4. Non usare temperature alta (> 0.5) per RAG
5. Non dimenticare di gestire errori OpenAI

---

## 🔧 Troubleshooting

### **Problema: "No embeddings found"**

```typescript
// Verifica che l'indice esista
const stats = getIndexStats(botId)
console.log(stats)

// Se non esiste, ri-processa i documenti
await processAndStoreDocument(botId, sourceId, sourceType, text)
```

### **Problema: "Low similarity scores"**

```typescript
// Abbassa la soglia minima
const chunks = await queryKnowledgeBase(botId, question, {
  topK: 5,
  minScore: 0.5, // Invece di 0.7
})
```

### **Problema: "Processing failed"**

```typescript
// Controlla errori nel database
const source = await prisma.knowledgeSource.findUnique({
  where: { id: sourceId },
})
console.log(source.errorMessage)
```

### **Problema: "FAISS index corrupted"**

```bash
# Elimina e ricostruisci
rm -rf data/faiss_indices/{bot_id}
# Poi ri-processa tutti i documenti
```

---

## 📈 Performance Metrics

### **Timing Attesi**

- PDF Upload (1MB): ~5-10s
- URL Scraping: ~2-5s
- Embedding Generation (1000 chars): ~500ms
- FAISS Search: ~50ms
- End-to-end Chat Response: ~2-3s

### **Costi OpenAI**

Per 1000 documenti da 5 pagine ciascuno:
- Embeddings: ~$5-10
- Chat Queries (10k): ~$20-30
- **Totale mensile**: ~$30-40

---

## 🚀 Deploy Checklist

- [ ] Installare dipendenze: `npm install`
- [ ] Aggiornare schema DB: `npx prisma db push`
- [ ] Creare cartella dati: `mkdir -p data/faiss_indices data/uploads`
- [ ] Configurare `.env` con OPENAI_API_KEY
- [ ] Testare upload PDF locale
- [ ] Testare add URL
- [ ] Testare chat query
- [ ] Verificare FAISS index persistenza
- [ ] Deploy su Vercel
- [ ] Configurare Vercel Postgres (per produzione)

---

## 🎓 Risorse

- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [FAISS Documentation](https://github.com/facebookresearch/faiss)
- [RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- [Chunking Strategies](https://www.pinecone.io/learn/chunking-strategies/)

---

**Sistema RAG implementato e funzionante! 🎉**
