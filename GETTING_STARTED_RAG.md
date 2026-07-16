# 🚀 Getting Started - Sistema RAG

Guida rapida per iniziare a usare il sistema RAG del chatbot.

---

## 📦 Installazione

### 1. Installa Dipendenze

```bash
npm install
```

Questo installerà:
- ✅ `faiss-node` - Vector store
- ✅ `pdf-parse` - PDF text extraction
- ✅ `cheerio` - Web scraping
- ✅ `openai` - Embeddings e LLM

### 2. Configura Database

```bash
# Aggiorna schema Prisma
npx prisma db push

# (Opzionale) Apri Prisma Studio
npm run db:studio
```

### 3. Crea Cartelle Dati

```bash
mkdir -p data/faiss_indices
mkdir -p data/uploads
```

### 4. Configura `.env`

```env
OPENAI_API_KEY=sk-your-api-key-here
DATABASE_URL="file:./dev.db"
ADMIN_SECRET=your-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🎯 Test Rapido (5 minuti)

### Step 1: Avvia l'App

```bash
npm run dev
```

### Step 2: Crea un Chatbot

1. Vai su http://localhost:3000/dashboard
2. Clicca "Nuovo Chatbot"
3. Inserisci nome azienda (es. "Test Company")
4. Copia il **Bot ID** dalla URL

### Step 3: Carica Documenti

**Opzione A: Via UI**
1. Clicca "Knowledge Base" sul chatbot
2. Carica un PDF o aggiungi URL
3. Aspetta che lo status diventi "Completato"

**Opzione B: Via API**

```bash
# Upload PDF
curl -X POST http://localhost:3000/api/knowledge-sources/upload-pdf \
  -F "file=@./test.pdf" \
  -F "botId=YOUR_BOT_ID"

# Add URL
curl -X POST http://localhost:3000/api/knowledge-sources/add-url \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "YOUR_BOT_ID",
    "url": "https://example.com/faq"
  }'
```

### Step 4: Testa la Chat

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "YOUR_BOT_ID",
    "message": "What are your business hours?"
  }'
```

**Risposta Attesa:**

```json
{
  "success": true,
  "data": {
    "conversationId": "uuid",
    "assistantMessage": {
      "content": "Secondo la Fonte 1, siamo aperti..."
    },
    "sources": [
      {
        "id": "uuid",
        "sourceType": "url",
        "sourceUrl": "https://example.com/faq"
      }
    ],
    "relevantChunks": 3
  }
}
```

---

## 🔍 Verifica Funzionamento

### 1. Check FAISS Index

```bash
ls -la data/faiss_indices/YOUR_BOT_ID/
```

Dovresti vedere:
- `index.faiss`
- `metadata.json`
- `documents.json`

### 2. Check Database

```bash
npm run db:studio
```

Vai su `knowledge_sources` e verifica:
- ✅ `status` = "completed"
- ✅ `chunkCount` > 0
- ✅ `processedAt` è impostato

### 3. Test Semantic Search

Crea un file `test-search.ts`:

```typescript
import { queryKnowledgeBase } from './lib/rag-pipeline'

async function test() {
  const results = await queryKnowledgeBase(
    'YOUR_BOT_ID',
    'your question here',
    { topK: 3, minScore: 0.7 }
  )
  
  console.log('Risultati trovati:', results.length)
  results.forEach((r, i) => {
    console.log(`\n[${i + 1}] Score: ${r.score.toFixed(3)}`)
    console.log(`Text: ${r.text.substring(0, 100)}...`)
  })
}

test()
```

Esegui:
```bash
npx ts-node test-search.ts
```

---

## 🎨 Personalizzazione

### Modifica Parametri Chunking

In `lib/chunking.ts`:

```typescript
export function chunkTextSmart(
  text: string,
  sourceId: string,
  sourceType: string,
  options: {
    chunkSize?: number    // Default: 1000
    overlap?: number      // Default: 200
  } = {}
)
```

### Modifica Parametri Retrieval

In `lib/rag-pipeline.ts`:

```typescript
const relevantChunks = await queryKnowledgeBase(botId, question, {
  topK: 5,          // Numero chunks da recuperare
  minScore: 0.7,    // Soglia similarità (0-1)
})
```

### Cambia Modello OpenAI

In `app/api/chat/route.ts`:

```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4',           // Usa GPT-4 invece di 3.5
  temperature: 0.3,
  max_tokens: 500,
})
```

---

## 💰 Stima Costi

### Scenario: 50 documenti, 1000 query/mese

**Embeddings (una tantum):**
- 50 documenti × 10 pagine × 500 parole = 250k parole
- 250k parole ≈ 330k tokens
- Cost: $0.0001/1K tokens = **$0.03**

**Chat Queries (mensili):**
- 1000 queries × 500 tokens/query = 500k tokens
- Cost: $0.002/1K tokens = **$1.00**

**Totale mensile: ~$1-2** 💸

---

## 🐛 Debug Common Issues

### Issue: "OpenAI API Error"

```bash
# Verifica API key
echo $OPENAI_API_KEY

# Test manuale
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Issue: "FAISS module not found"

```bash
# Reinstalla faiss-node
npm uninstall faiss-node
npm install faiss-node

# Se fallisce, prova build da source
npm install --build-from-source faiss-node
```

### Issue: "PDF extraction failed"

```bash
# Verifica che pdf-parse funzioni
node -e "const pdf = require('pdf-parse'); console.log('OK')"

# Test estrazione
node -e "
const fs = require('fs');
const pdf = require('pdf-parse');
const dataBuffer = fs.readFileSync('test.pdf');
pdf(dataBuffer).then(data => console.log(data.text));
"
```

### Issue: "No results from search"

```typescript
// Abbassa la soglia di similarità
const chunks = await queryKnowledgeBase(botId, question, {
  topK: 10,      // Più risultati
  minScore: 0.5, // Soglia più bassa
})

// Controlla che ci siano documenti
const stats = getIndexStats(botId)
console.log(stats)
```

---

## 📚 Esempi d'Uso

### Esempio 1: Customer Support Bot

```typescript
// 1. Carica FAQ
await uploadPDF(botId, 'faq.pdf')
await addURL(botId, 'https://yoursite.com/support')

// 2. Utente chiede
const response = await chat(botId, "How do I reset my password?")

// 3. Bot risponde con info da FAQ
// "Secondo la Fonte 1, puoi resettare la password..."
```

### Esempio 2: Product Documentation Bot

```typescript
// 1. Carica manuali
await uploadPDF(botId, 'user-manual.pdf')
await uploadPDF(botId, 'api-docs.pdf')

// 2. Developer chiede
const response = await chat(botId, "How do I authenticate API requests?")

// 3. Bot cita documentazione specifica
```

### Esempio 3: HR Policy Bot

```typescript
// 1. Carica policy aziendali
await uploadPDF(botId, 'employee-handbook.pdf')
await uploadPDF(botId, 'benefits-guide.pdf')

// 2. Dipendente chiede
const response = await chat(botId, "What is the vacation policy?")

// 3. Bot risponde con policy ufficiali
```

---

## 🚀 Deploy in Produzione

### 1. Vercel Deployment

```bash
# Deploy
vercel

# Configura env vars su Vercel Dashboard:
# - OPENAI_API_KEY
# - DATABASE_URL (Vercel Postgres)
# - ADMIN_SECRET
```

### 2. Database Migration

```bash
# Per produzione, usa PostgreSQL
# Aggiorna prisma/schema.prisma:
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

# Push schema
npx prisma db push
```

### 3. Storage Persistence

**Opzione A: Vercel Blob Storage**
```bash
npm install @vercel/blob
```

**Opzione B: AWS S3**
```bash
npm install @aws-sdk/client-s3
```

---

## ✅ Checklist Pre-Deploy

- [ ] OpenAI API key configurata
- [ ] Database funzionante (SQLite o PostgreSQL)
- [ ] FAISS indices salvati correttamente
- [ ] Test upload PDF
- [ ] Test add URL
- [ ] Test chat query
- [ ] Error handling implementato
- [ ] Rate limiting configurato
- [ ] Logs e monitoring attivi

---

**Pronto per l'uso! 🎉**

Hai domande? Controlla `RAG_SYSTEM.md` per dettagli tecnici.
