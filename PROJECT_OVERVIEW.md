# 🤖 Chatbot RAG MVP - Project Overview

> **Ultima Modifica**: 2026-01-05  
> **Status**: ✅ Production Ready (con ottimizzazioni minori da fare)  
> **Tech Stack**: Next.js 14, TypeScript, Prisma, OpenAI, TailwindCSS

---

## 📋 COSA È QUESTO PROGETTO

Una **piattaforma enterprise-grade multi-tenant** per creare e gestire chatbot AI intelligenti con tecnologia RAG (Retrieval-Augmented Generation). Permette ad aziende diverse di avere il proprio chatbot personalizzato con knowledge base dedicata.

### Caso d'Uso Principale
Aziende SaaS/E-commerce/Consulting che vogliono automatizzare customer support, sales, o advisory utilizzando documenti proprietari (PDF, URL) come knowledge base.

---

## 🏗️ ARCHITETTURA TECNICA

### Stack Tecnologico
```yaml
Frontend: Next.js 14 (App Router), React 18, TailwindCSS
Backend: Next.js API Routes (server-side)
Database: SQLite (dev) → PostgreSQL (production ready)
ORM: Prisma
AI/ML: OpenAI GPT-4 + text-embedding-ada-002
Vector Store: Custom in-memory + JSON persistence
Language: TypeScript
Deployment: Vercel ready
```

### Database Schema (Prisma)
```
Chatbot
├── id, companyName, isActive, createdAt, trialEndDate
├── promptTemplateId (7 template professionali disponibili)
├── systemPrompt (custom override opzionale)
├── promptVariables (JSON: {COMPANY_NAME, PRODUCT_NAME, etc.})
├── settings (JSON: widget colors, botName, welcomeMessage)
├── knowledgeSources[] → KnowledgeSource
└── conversations[] → Conversation

KnowledgeSource
├── id, botId, sourceType (url/pdf)
├── sourceUrl, originalFilename, contentText
├── status (processing/completed/failed)
├── chunkCount, errorMessage
└── → Vector Store (embeddings + chunks)

Conversation
├── id, botId, userSessionId, startedAt, lastMessageAt
├── userIntent (support/sales/info/complaint)
├── sentiment (positive/neutral/negative)
├── isResolved, summary, lastSummaryAt
├── userData: userName, userEmail, userPhone, userCompany
├── extractedData (JSON custom fields)
├── topicsDiscussed (JSON array)
└── messages[] → Message

Message
├── id, conversationId, role (user/assistant)
├── content, createdAt
└── sourcesUsed (JSON: [{sourceId, relevanceScore, snippet}])
```

---

## 🧠 SISTEMA RAG AVANZATO

### Pipeline Multi-Stage (Anti-Hallucination)

```
Query Utente
    ↓
1. Intent Classification → greeting/question/chitchat/escalation
    ↓
2. Semantic Search → Embeddings cosine similarity
    ↓
3. Keyword Search → BM25-like term matching
    ↓
4. Reciprocal Rank Fusion → Combina semantic + keyword
    ↓
5. Contextual Reranking → Riordina per query + conversation context
    ↓
6. Confidence Scoring → topScore, avgTop3, highQualityCount
    ↓
7. Threshold Gating → Se confidence < 0.75 → Fallback message
    ↓
Risposta AI (solo se confidence sufficiente)
```

### Confidence Scoring (Anti-Hallucination)
```typescript
overallConfidence = topScore * 0.5 + avgTop3 * 0.3 + highQualityRatio * 0.2

Thresholds:
- minTopScore: 0.75
- minAvgScore: 0.65
- minHighQualityChunks: 1 (score > 0.7)
```

**Se confidence insufficiente** → Sistema ammette di non sapere invece di inventare

### Chunking Intelligente
- **Adaptive**: Paragraph-based (testi strutturati) o Sentence-aware (testi generici)
- **Size**: ~1000 caratteri per chunk
- **Overlap**: 200 caratteri per preservare contesto
- **Boundary-aware**: Non split mid-sentence

---

## 🎭 SISTEMA PROMPT TEMPLATES

### Template Disponibili (7 Professionali)

| ID | Nome | Categoria | Use Case |
|---|---|---|---|
| `customer-support` | Supporto Clienti | Support | Assistenza tecnica, troubleshooting, FAQ |
| `sales-assistant` | Venditore AI | Sales | Product recommendation, upselling |
| `lead-qualifier` | Qualifica Lead | Sales | Raccolta info contatto, budget, timeline |
| `consulting-advisor` | Consulente Strategico | Consulting | Advisory professionale, best practices |
| `faq-bot` | FAQ Automatizzato | Informative | Risposte veloci domande comuni |
| `onboarding-guide` | Guida Onboarding | Educational | Tutorial step-by-step per nuovi utenti |
| `custom` | Agente Personalizzato | Custom | Template vuoto per customizzazione totale |

### Struttura Template
Ogni template include:
- ✅ **Identità e Ruolo** chiaro
- ✅ **Regole Assolute** (es: "USA SOLO KNOWLEDGE BASE")
- ✅ **Esempi Negativi** (cosa NON fare per evitare errori)
- ✅ **Stile e Tono** specifico per il caso d'uso
- ✅ **Gestione Fallback** (quando non sa rispondere)
- ✅ **Placeholders dinamici** (`{{COMPANY_NAME}}`, `{{PRODUCT_NAME}}`, etc.)

**Priority Chain**:
```
Custom systemPrompt > Template con variabili > Default template (customer-support)
```

---

## 🧩 FUNZIONALITÀ AVANZATE

### 1. Conversation Memory System
**Estrazione Automatica Dati**:
- Nome, Email, Telefono, Azienda
- Custom fields dinamici
- Validazione automatica (email regex, phone format)

**Metadata Tracking**:
- Intent classification (support/sales/info/complaint)
- Sentiment analysis (positive/neutral/negative)
- Resolution tracking (isResolved)
- Auto-summarization per conversazioni lunghe (>20 messaggi)
- Topic extraction

**Context Optimization**:
- Sliding window: ultimi 10 messaggi
- Summarization per context efficiency
- Deduplicazione automatica

### 2. Vectorized Fact Memory (In Development)
Sistema memoria vettorizzata per ricordare fatti importanti:
- Estrae fatti con embeddings
- Categorizza: `personal_info`, `preference`, `interest`, `problem`, `feedback`, `intent`
- Importance scoring (recency + type weight)
- Recall semantico con cosine similarity

**⚠️ TODO**: Integrazione DB per persistenza (attualmente in-memory)

### 3. Intent Classification
Auto-classifica intent utente:
- **Greeting**: Saluti, presentazioni
- **Question**: Domande dirette
- **Chitchat**: Conversazione informale
- **Escalation**: Richiesta operatore umano
- **Follow-up detection**: Riferimenti a messaggi precedenti

---

## 📡 API ENDPOINTS

### Chatbot Management
```
POST   /api/chatbots              → Crea chatbot
GET    /api/chatbots              → Lista tutti i chatbot
GET    /api/chatbots/[id]         → Dettagli chatbot specifico
PUT    /api/chatbots/[id]         → Aggiorna configurazione
DELETE /api/chatbots/[id]         → Elimina chatbot (cascade)
```

### Knowledge Base
```
POST   /api/knowledge-sources               → Aggiungi fonte generica
POST   /api/knowledge-sources/upload-pdf    → Upload PDF
POST   /api/knowledge-sources/add-url       → Aggiungi URL
GET    /api/knowledge-sources?botId={id}    → Lista fonti per bot
DELETE /api/knowledge-sources/[id]          → Elimina fonte
```

### Chat & Conversations
```
POST   /api/chat                           → Invia messaggio + RAG pipeline
GET    /api/conversations?botId={id}       → Lista conversazioni
GET    /api/conversations/[id]             → Dettagli conversazione
DELETE /api/conversations/[id]             → Elimina conversazione
GET    /api/messages?conversationId={id}   → Messaggi conversazione
```

### Utility
```
GET    /api/health              → Health check
GET    /api/prompt-templates    → Lista template disponibili
```

---

## 🖥️ INTERFACCIA UTENTE

### Pagine
```
/                        → Homepage landing
/dashboard               → Gestione chatbot (lista + create modal)
/chat/[botId]            → Chat interface utente finale
/chatbot/[id]/knowledge  → Gestione knowledge base (upload PDF/URL)
```

### Componenti React Chiave
- `<Navbar />` - Navigazione principale
- `<PromptTemplateSelector />` - Selector template con preview interattiva

### UI/UX Features
- ✅ Design moderno TailwindCSS
- ✅ Responsive mobile-first
- ✅ Real-time chat updates
- ✅ Loading states + error handling
- ✅ Source citations inline

---

## 📂 STRUTTURA FILE SYSTEM

### Directory Principali
```
app/
├── api/              → API routes (chatbots, chat, knowledge, conversations)
├── dashboard/        → Dashboard gestione chatbot
├── chat/[botId]/     → Chat interface
└── chatbot/[id]/     → Configurazione chatbot

lib/
├── rag-pipeline.ts           → Orchestratore RAG principale
├── advanced-rag.ts           → Multi-stage retrieval + reranking
├── confidence-scoring.ts     → Anti-hallucination scoring
├── intent-classifier.ts      → Intent classification
├── conversation-memory.ts    → Memory system + data extraction
├── vectorized-fact-memory.ts → Fact memory con embeddings
├── prompt-manager.ts         → Gestione system prompts
├── prompt-templates.ts       → Template definitions (7 templates)
├── embeddings.ts             → OpenAI embeddings wrapper
├── simple-vector-store.ts    → Vector store JSON-based
├── chunking.ts               → Smart text chunking
├── document-processors.ts    → PDF + URL processing
├── token-counter.ts          → Token usage tracking
└── types.ts                  → TypeScript types + Zod schemas

prisma/
├── schema.prisma     → Database schema
└── dev.db            → SQLite database (dev)

data/
├── uploads/          → PDF files uploadati
└── vector_store/     → Embeddings + vectors (JSON per bot)
```

---

## 🎯 PUNTI DI FORZA

✅ **Anti-Hallucination Robusto** - Confidence scoring + threshold gating  
✅ **Multi-Stage RAG** - Semantic + Keyword + Fusion + Reranking  
✅ **Template System Professionale** - 7 template production-ready  
✅ **Conversation Intelligence** - Intent, sentiment, data extraction  
✅ **Type-Safety Completo** - TypeScript + Zod validation  
✅ **Chunking Intelligente** - Adaptive, sentence-aware  
✅ **Scalabile Multi-Tenant** - Isolamento per chatbot  
✅ **Production Ready** - Error handling, logging, validation  

---

## ⚠️ TODO E MIGLIORAMENTI FUTURI

### High Priority
- [ ] **Background Processing** per embedding generation (attualmente sincrono in API)
- [ ] **Vectorized Fact Memory DB** - Persistenza fatti (attualmente in-memory)
- [ ] **Rate Limiting** - Protezione API abuse
- [ ] **CORS Configuration** - Per widget embed

### Medium Priority
- [ ] **Vector Store Production** - Migrare a Pinecone/Weaviate/Supabase
- [ ] **Monitoring Dashboard** - Metriche response time, accuracy, satisfaction
- [ ] **A/B Testing** - Test prompt templates effectiveness
- [ ] **Multi-language Support** - i18n (attualmente solo italiano)

### Low Priority
- [ ] **Widget Embed Code** - Script per embeddare chat in siti esterni
- [ ] **Analytics Export** - CSV/PDF export conversazioni
- [ ] **Voice Support** - Speech-to-text integration
- [ ] **File Upload in Chat** - Permettere upload file durante chat

---

## 🔐 SICUREZZA E PRODUZIONE

### Implemented
✅ Input validation con Zod  
✅ Environment variables per secrets  
✅ Cascade delete (Prisma relations)  
✅ SQL injection protection (Prisma ORM)  
✅ Error handling robusto  

### Da Configurare in Production
⚠️ `ADMIN_SECRET` - Cambiare da default  
⚠️ `OPENAI_API_KEY` - Configurare billing limits  
⚠️ Rate limiting middleware  
⚠️ CORS policy per widget  
⚠️ HTTPS enforcement  
⚠️ Database backup automation  

---

## 📊 METRICHE TRACCIABILI

Il sistema già traccia:
- ✅ Numero conversazioni per chatbot
- ✅ Sentiment distribution
- ✅ Resolution rate (isResolved)
- ✅ Intent classification distribution
- ✅ Knowledge sources utilizzate (sourcesUsed)
- ✅ Token usage (per ottimizzazione costi)

**Dashboard Analytics** - Da implementare per visualizzazione metriche

---

## 🚀 DEPLOYMENT

### Environment Variables Necessarie
```bash
OPENAI_API_KEY=sk-...
DATABASE_URL="postgresql://..." o "file:./dev.db"
ADMIN_SECRET=your_secret_here
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Platform Suggestions
- **Vercel** - Zero-config, ottimo per Next.js
- **Railway** - PostgreSQL incluso, semplice
- **Render** - Alternative con free tier

### Checklist Pre-Deploy
- [ ] Migrare da SQLite a PostgreSQL
- [ ] Configurare `ADMIN_SECRET` sicuro
- [ ] Setup backup database
- [ ] Configurare monitoring (Sentry/LogRocket)
- [ ] Test load (stress testing)
- [ ] Setup CDN per static assets

---

## 🧪 TESTING

### Da Implementare
- [ ] Unit tests per lib/ (Jest)
- [ ] Integration tests per API routes (Supertest)
- [ ] E2E tests (Playwright/Cypress)
- [ ] Load testing (Artillery/k6)

---

## 🎓 BEST PRACTICES UTILIZZATE

✅ **Server-Only Components** - `'server-only'` import per sicurezza  
✅ **Type Safety** - TypeScript strict mode  
✅ **Schema Validation** - Zod per input validation  
✅ **Error Boundaries** - Graceful error handling  
✅ **Loading States** - UX per async operations  
✅ **Code Organization** - Separation of concerns (lib/app/components)  
✅ **Git Ignored Secrets** - `.env` non committato  

---

## 📞 COME USARE QUESTO DOCUMENTO

### Per nuove sessioni AI
Questo file serve come **context iniziale** per comprendere rapidamente:
- Cosa fa il progetto
- Come è strutturato
- Cosa è già implementato
- Cosa manca ancora

### Quando aggiornare
Aggiorna questo file quando:
- Implementi nuove feature major
- Cambi architettura
- Completi TODO items
- Aggiungi nuovi template o funzionalità core

---

## 🎯 QUICK START PER SVILUPPO

```powershell
# 1. Install dependencies
npm install

# 2. Setup database
npx prisma generate
npx prisma db push

# 3. Configure .env
cp .env.example .env
# Edit .env con tua OPENAI_API_KEY

# 4. Start dev server
npm run dev

# 5. Apri browser
http://localhost:3000
```

---

## 📚 RISORSE UTILI

- [Documentazione Next.js 14](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [RAG Best Practices](https://docs.anthropic.com/claude/docs/retrieval-augmented-generation)

---

**Last Updated**: 2026-01-05  
**Maintainer**: Project Owner  
**Status**: ✅ Production Ready (con ottimizzazioni minori)
