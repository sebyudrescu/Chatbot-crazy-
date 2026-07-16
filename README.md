# 🤖 Chatbot RAG MVP - Next.js Edition

Un sistema di chatbot intelligente con **Retrieval-Augmented Generation (RAG)** costruito con Next.js 14, TypeScript, Prisma e OpenAI.

## ✨ Caratteristiche

- 🚀 **Next.js 14** con App Router
- 🎨 **TypeScript** per type safety
- 💾 **Prisma ORM** con SQLite (locale) / PostgreSQL (produzione)
- 🤖 **OpenAI GPT-3.5** per risposte intelligenti
- 🧠 **Sistema RAG completo** - Retrieval-Augmented Generation
- 📄 **Upload PDF** con estrazione testo automatica
- 🌐 **Web Scraping** per URL
- 🔍 **FAISS Vector Store** per semantic search
- 📚 **Knowledge Base** separata per ogni bot
- 🎯 **API RESTful** complete
- 🌐 **Vercel-ready** per deploy immediato
- 💅 **Tailwind CSS** per UI moderna

## 🧠 Sistema RAG

Questo chatbot usa **Retrieval-Augmented Generation** per rispondere usando SOLO le informazioni caricate:

1. **Admin carica documenti** (PDF o URL)
2. **Sistema processa** → crea embeddings → salva in FAISS
3. **Utente fa domanda** → sistema cerca contenuti rilevanti → GPT genera risposta
4. **Ogni bot** ha la sua knowledge base separata e indipendente

📘 **Guida Completa:** [RAG_SYSTEM.md](RAG_SYSTEM.md)  
🚀 **Quick Start:** [GETTING_STARTED_RAG.md](GETTING_STARTED_RAG.md)

---

## 🚀 Avvio Rapido (3 passi)

### 1. Installa Dipendenze

```bash
npm install
```

### 2. Configura Variabili d'Ambiente

Copia `.env.example` in `.env` e inserisci la tua API key:

```bash
cp .env.example .env
```

Modifica `.env`:
```env
OPENAI_API_KEY=sk-your-api-key-here
DATABASE_URL="file:./dev.db"
ADMIN_SECRET=your-secret-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Inizializza Database e Avvia

```bash
# Genera Prisma Client e crea database
npx prisma db push

# Avvia il server di sviluppo
npm run dev
```

**🎉 Fatto! Apri http://localhost:3000**

## 📍 Endpoints Principali

Una volta avviato, accedi a:

- **Homepage:** http://localhost:3000
- **Dashboard:** http://localhost:3000/dashboard
- **Knowledge Base UI:** http://localhost:3000/chatbot/{id}/knowledge
- **Health Check:** http://localhost:3000/api/health
- **Prisma Studio:** `npm run db:studio`

### 🧪 Test RAG System

```bash
# 1. Crea un chatbot dalla dashboard
# 2. Carica un PDF o aggiungi URL nella Knowledge Base
# 3. Aspetta che processing completi
# 4. Testa chat API:

curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "YOUR_BOT_ID",
    "message": "Your question here"
  }'
```

## 🗂️ Struttura del Progetto

```
.
├── app/
│   ├── api/                    # API Routes
│   │   ├── health/            # Health check
│   │   ├── chatbots/          # CRUD chatbots
│   │   ├── conversations/     # Gestione conversazioni
│   │   ├── messages/          # Messaggi
│   │   ├── knowledge-sources/ # Knowledge base management
│   │   │   ├── upload-pdf/   # Upload PDF endpoint
│   │   │   └── add-url/      # Add URL endpoint
│   │   └── chat/              # Chat con RAG
│   ├── dashboard/             # Dashboard UI
│   ├── chatbot/[id]/knowledge/ # Knowledge Base UI
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── lib/
│   ├── db.ts                  # Prisma client
│   ├── types.ts               # TypeScript types
│   ├── utils.ts               # Utility functions
│   ├── embeddings.ts          # OpenAI embeddings
│   ├── chunking.ts            # Smart text chunking
│   ├── document-processors.ts # PDF/URL extraction
│   ├── vector-store.ts        # FAISS wrapper
│   └── rag-pipeline.ts        # RAG orchestrator
├── prisma/
│   └── schema.prisma          # Database schema
├── data/
│   ├── faiss_indices/         # FAISS vector indices
│   └── uploads/               # Uploaded files
├── RAG_SYSTEM.md              # RAG documentation
├── GETTING_STARTED_RAG.md     # Quick start guide
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

## 🗄️ Schema Database

### Tabelle

1. **chatbots** - Istanze chatbot per aziende
2. **knowledge_sources** - Fonti di conoscenza (URL/PDF)
3. **conversations** - Sessioni di chat
4. **messages** - Messaggi singoli

### Relazioni

```
Chatbot
  ├─ KnowledgeSource[] (cascade delete)
  └─ Conversation[]
       └─ Message[] (cascade delete)
```

## 📡 API Reference

### Chatbots

```bash
# Get all chatbots
GET /api/chatbots

# Create chatbot
POST /api/chatbots
Body: { "companyName": "Acme Corp" }

# Get specific chatbot
GET /api/chatbots/{id}

# Update chatbot
PATCH /api/chatbots/{id}
Body: { "isActive": false }

# Delete chatbot
DELETE /api/chatbots/{id}
```

### Chat

```bash
# Send message and get AI response
POST /api/chat
Body: {
  "botId": "uuid",
  "message": "Hello!",
  "conversationId": "uuid" // optional
}
```

### Conversations

```bash
# Get conversations
GET /api/conversations?botId={id}

# Create conversation
POST /api/conversations
Body: { "botId": "uuid", "userSessionId": "session_123" }

# Get conversation with messages
GET /api/conversations/{id}
```

## 🧪 Testing Locale

### Test con cURL

```bash
# Health check
curl http://localhost:3000/api/health

# Create chatbot
curl -X POST http://localhost:3000/api/chatbots \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Test Company"}'

# List chatbots
curl http://localhost:3000/api/chatbots
```

### Test con Prisma Studio

```bash
npm run db:studio
```

Apri http://localhost:5555 per visualizzare e modificare i dati del database.

## 🚀 Deploy su Vercel

### Deploy Automatico

1. Push del codice su GitHub
2. Vai su [vercel.com](https://vercel.com)
3. Clicca "Import Project"
4. Seleziona il repository
5. Configura le variabili d'ambiente:
   - `OPENAI_API_KEY`
   - `DATABASE_URL` (PostgreSQL su Vercel Postgres)
   - `ADMIN_SECRET`
6. Deploy! 🎉

### Deploy da CLI

```bash
# Installa Vercel CLI
npm i -g vercel

# Deploy
vercel

# Deploy in produzione
vercel --prod
```

### Database in Produzione

Per produzione, usa PostgreSQL (Vercel Postgres):

1. Crea un database Vercel Postgres
2. Copia la `DATABASE_URL`
3. Aggiorna `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"  // cambia da "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
4. Push schema: `npx prisma db push`

## 🛠️ Comandi Utili

```bash
# Sviluppo
npm run dev              # Avvia dev server
npm run build            # Build produzione
npm run start            # Avvia produzione
npm run lint             # Linting

# Database
npm run db:push          # Push schema al database
npm run db:studio        # Apri Prisma Studio
npx prisma generate      # Genera Prisma Client
npx prisma migrate dev   # Crea migration (produzione)

# Deploy
vercel                   # Deploy preview
vercel --prod            # Deploy produzione
```

## 🎨 Personalizzazione

### Cambiare il Modello OpenAI

Modifica `app/api/chat/route.ts`:

```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4', // Cambia qui
  messages: [...],
})
```

### Modificare gli Stili

I colori sono configurati in `tailwind.config.ts`.

### Aggiungere Autenticazione

Integra con:
- **NextAuth.js** per auth completa
- **Clerk** per auth semplice
- **Auth0** per enterprise

## 📚 Tecnologie Utilizzate

- [Next.js 14](https://nextjs.org/) - React Framework
- [TypeScript](https://www.typescriptlang.org/) - Type Safety
- [Prisma](https://www.prisma.io/) - ORM
- [OpenAI](https://openai.com/) - AI Models
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Zod](https://zod.dev/) - Validation
- [Lucide Icons](https://lucide.dev/) - Icons

## 🔒 Sicurezza

⚠️ **Per produzione:**

1. Aggiungi autenticazione agli endpoint API
2. Valida input con Zod
3. Implementa rate limiting
4. Usa variabili d'ambiente sicure
5. Abilita CORS selettivo
6. Implementa logging e monitoring

## 🐛 Troubleshooting

### "Module not found: Can't resolve '@/lib/db'"

```bash
npm install
npx prisma generate
```

### Database locked error

Chiudi Prisma Studio e riavvia il dev server.

### OpenAI API errors

Verifica che `OPENAI_API_KEY` sia configurata correttamente in `.env`.

## 🤝 Contributi

I contributi sono benvenuti! Apri una issue o pull request.

## 📄 Licenza

MIT

---

**Made with ❤️ using Next.js and OpenAI**
