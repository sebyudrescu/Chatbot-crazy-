# 🚀 Guida Rapida - Next.js Chatbot RAG

## 📋 Requisiti

- **Node.js 18+** (non serve Python!)
- **npm** o **yarn**
- **OpenAI API Key**

## ⚡ Avvio in 3 Minuti

### Passo 1: Installa Node.js (se non ce l'hai)

**Windows:**
- Vai su https://nodejs.org/
- Scarica l'installer LTS
- Installa e riavvia il terminale

**Mac:**
```bash
brew install node
```

**Verifica installazione:**
```bash
node --version  # Dovrebbe mostrare v18+
npm --version
```

---

### Passo 2: Installa Dipendenze

Apri il terminale nella cartella del progetto:

```bash
npm install
```

Aspetta 1-2 minuti mentre scarica i pacchetti.

---

### Passo 3: Configura API Key

1. **Crea file `.env`:**

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Mac/Linux:**
```bash
cp .env.example .env
```

2. **Apri `.env` e inserisci la tua API key:**

```env
OPENAI_API_KEY=sk-your-actual-api-key-here
DATABASE_URL="file:./dev.db"
ADMIN_SECRET=my-secret-123
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

### Passo 4: Inizializza Database

```bash
npx prisma db push
```

Questo comando:
- ✅ Genera il Prisma Client
- ✅ Crea il database SQLite
- ✅ Crea tutte le tabelle

---

### Passo 5: Avvia l'Applicazione! 🎉

```bash
npm run dev
```

Dovresti vedere:

```
  ▲ Next.js 14.1.0
  - Local:        http://localhost:3000
  - Environments: .env

 ✓ Ready in 2.5s
```

---

## 🎨 Dove Vedere la Preview

Apri il browser su:

### 1. **Homepage** 
```
http://localhost:3000
```
Pagina di benvenuto con feature overview

### 2. **Dashboard** ⭐ (Consigliato!)
```
http://localhost:3000/dashboard
```
Interfaccia per creare e gestire chatbot

### 3. **Health Check**
```
http://localhost:3000/api/health
```
Verifica che tutto funzioni

### 4. **Prisma Studio** (Database Viewer)
```bash
npm run db:studio
```
Poi vai su http://localhost:5555

---

## 🧪 Test Rapido

### Test 1: Crea il Tuo Primo Chatbot

1. Vai su http://localhost:3000/dashboard
2. Clicca "Nuovo Chatbot"
3. Inserisci un nome azienda (es. "Acme Corp")
4. Vedrai il chatbot nella lista!

### Test 2: API Call con cURL

```bash
# Windows (PowerShell)
Invoke-RestMethod -Uri http://localhost:3000/api/health -Method Get

# Mac/Linux
curl http://localhost:3000/api/health
```

Risposta:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "database": "connected",
  "version": "0.1.0"
}
```

### Test 3: Invia un Messaggio al Chatbot

```bash
# Prima crea un chatbot e copia il suo ID
curl -X POST http://localhost:3000/api/chatbots \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Test Company"}'

# Poi invia un messaggio (sostituisci BOT_ID)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"botId":"BOT_ID","message":"Hello!"}'
```

---

## 🎯 Struttura Cartelle (cosa trovi dove)

```
📁 Progetto
├── 📁 app/              # Applicazione Next.js
│   ├── 📁 api/         # API Routes (Backend)
│   ├── 📁 dashboard/   # UI Dashboard
│   ├── page.tsx        # Homepage
│   └── layout.tsx      # Layout base
├── 📁 lib/             # Utilities
│   ├── db.ts          # Database client
│   └── types.ts       # TypeScript types
├── 📁 prisma/          # Database
│   └── schema.prisma  # Schema del database
├── package.json        # Dipendenze
├── .env               # Le tue configurazioni
└── README.md          # Documentazione
```

---

## 🛠️ Comandi Principali

```bash
# Sviluppo
npm run dev          # Avvia server (http://localhost:3000)
npm run build        # Build per produzione
npm run start        # Avvia versione produzione

# Database
npm run db:push      # Aggiorna database schema
npm run db:studio    # Visualizzatore database UI

# Utility
npm run lint         # Controlla errori codice
```

---

## 🔥 Features Già Implementate

✅ **API Complete:**
- Gestione chatbot (CRUD)
- Conversazioni
- Messaggi
- Knowledge sources
- Chat con OpenAI

✅ **UI Dashboard:**
- Lista chatbot
- Creazione/eliminazione
- Statistiche (fonti, conversazioni)

✅ **Database:**
- 4 tabelle con relazioni
- Cascade delete
- Indexes ottimizzati

✅ **Integrazione OpenAI:**
- Chat endpoint funzionante
- Context awareness
- Knowledge base integration

---

## 🚀 Deploy su Vercel (Opzionale)

### 1. Push su GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_URL
git push -u origin main
```

### 2. Deploy su Vercel

1. Vai su https://vercel.com
2. Clicca "New Project"
3. Importa il tuo repository GitHub
4. Configura le variabili d'ambiente:
   - `OPENAI_API_KEY`
   - `DATABASE_URL` (usa Vercel Postgres)
   - `ADMIN_SECRET`
5. Clicca "Deploy"

**🎉 La tua app sarà live in 1 minuto!**

---

## ❓ Problemi Comuni

### "npm: command not found"
- Installa Node.js da https://nodejs.org/

### "Module not found: Can't resolve '@/lib/db'"
```bash
npm install
npx prisma generate
```

### "Port 3000 already in use"
```bash
# Usa un'altra porta
npm run dev -- -p 3001
```

### Il database non si crea
```bash
# Rigenera tutto
rm -rf node_modules prisma/dev.db
npm install
npx prisma db push
```

---

## 💡 Prossimi Passi

Ora che l'app funziona, puoi:

1. **Esplorare il codice** - Apri i file in `app/api/` per vedere le API
2. **Personalizzare il design** - Modifica `tailwind.config.ts`
3. **Aggiungere features** - Upload PDF, scraping URL, ecc.
4. **Testare la chat** - Usa l'endpoint `/api/chat`
5. **Deployare online** - Su Vercel in 1 click

---

## 🆘 Serve Aiuto?

Se qualcosa non funziona:

1. Controlla che Node.js sia installato: `node --version`
2. Verifica il file `.env` esista e sia configurato
3. Assicurati di aver eseguito `npx prisma db push`
4. Controlla il terminale per errori

Buon divertimento! 🚀
