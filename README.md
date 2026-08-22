# LitX AI Agent Studio

Piattaforma privata, single-owner, per creare e gestire chatbot professionali destinati ai clienti dell'agenzia. Il runtime combina un orchestratore LLM agentico, knowledge base verificata, cataloghi e-commerce ufficiali, widget incorporabile, canali Meta, Help Desk, CRM interno, evaluation e osservabilita operativa.

## Stack autoritativo

- Node.js 24
- Next.js 16 App Router e React 19
- TypeScript
- PostgreSQL con Prisma
- OpenAI Responses API per il core agentico
- PostgreSQL come fallback vettoriale durevole; Pinecone opzionale
- Vercel per il deployment web

SQLite, FAISS su filesystem locale e directory `data/uploads` non fanno parte dell'architettura operativa. I file caricati vengono elaborati senza dipendere da storage effimero Vercel.

## Funzionalita principali

- Creazione, clonazione, import/export e configurazione degli agenti
- System prompt, modelli GPT-5.6, versioni prompt e rollback
- Ingestione URL, crawler, PDF/DOCX/TXT/CSV/JSON e knowledge manuale
- Retrieval ibrido, BM25, reranking, grounding ed evaluation calibrate per agente
- Core agentico con tool calling per knowledge, prodotti, inventario, ordini e azioni
- Shopify e WooCommerce ufficiali con OAuth, sync riprendibile, varianti, webhook e tracking ordini
- Widget personalizzabile e Widget Studio dichiarativo senza JavaScript arbitrario
- WhatsApp e Instagram tramite API ufficiali Meta
- Help Desk con handoff, priorita, assegnazione, SLA e viste salvate
- CRM interno agent-bound, analytics, funnel commerce firmato e Control Room AI supervisionata
- Readiness di pubblicazione, audit, retention, backup/restore drill e notifiche operative

## Requisiti

1. Node.js 24 e npm.
2. Un database PostgreSQL raggiungibile.
3. Una chiave OpenAI server-side.
4. Segreti applicativi distinti e casuali.

Le integrazioni Shopify, WooCommerce, Meta, Pinecone, Firecrawl, Jina e Resend sono opzionali finche la relativa funzione non viene attivata.

## Avvio locale

```powershell
git clone https://github.com/sebyudrescu/Chatbot-crazy-.git
cd Chatbot-crazy-
npm ci
Copy-Item .env.example .env.local
```

Compila almeno questi valori in `.env.local`:

```dotenv
DATABASE_URL="postgresql://..."
OPENAI_API_KEY="..."
APP_ACCESS_PASSWORD="..."
APP_AUTH_SALT="..."
COMMERCE_CLICK_SECRET="..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Poi applica le migration e avvia:

```powershell
npx prisma migrate deploy
npm run dev
```

Apri `http://localhost:3000`. Non usare `prisma db push` come sostituto delle migration in produzione.

## Comandi di qualita

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:commerce-security
npm run test:agentic-contract
npm run test:conversation-quality
npm run test:widget
npm run test:helpdesk
npm run test:observability
```

`npm run audit:project` esegue typecheck, lint e build. La pipeline GitHub Actions aggiunge PostgreSQL effimero, backup/restore drill, smoke API e le suite crawler, commerce, widget, sicurezza, memoria, Help Desk, Meta e automazioni.

I test che accedono al database richiedono un `DATABASE_URL` isolato: non puntarli al database di produzione.

## Architettura sintetica

```text
Web / widget / API / WhatsApp / Instagram
                    |
            orchestratore agentico
                    |
       +------------+-------------+
       |            |             |
   knowledge     commerce      azioni/handoff
       |            |             |
 PostgreSQL /   Shopify e      CRM / Help Desk
 Pinecone opt.  WooCommerce    / workflow
```

I router deterministici restano soltanto ai confini di sicurezza, privacy, idempotenza e compatibilita. La comprensione semantica e la scelta dei tool appartengono al modello.

## Dati e sicurezza

- Tutte le risorse cliente sono isolate per `botId`.
- Gli endpoint owner richiedono la sessione privata.
- Widget, webhook, OAuth e API pubbliche applicano firme, sessioni, allowlist e rate limit propri.
- Token e configurazioni sensibili vengono cifrati o hashati.
- Conversioni commerce firmate verificano bot, conversazione e sessione e minimizzano i metadata.
- Le evaluation non devono creare lead, inviare webhook o produrre altri side effect reali.
- Non inserire password, token o dati cliente nella documentazione o nei commit.

## Deployment

Il progetto e collegato a Vercel. `vercel-build` applica `prisma migrate deploy` prima della build Next.js. Prima di una consegna cliente verificare:

1. GitHub Actions verde sul commit esatto.
2. Deployment Vercel `Ready` associato allo stesso commit.
3. `/api/health` con stato `healthy` e database `connected`.
4. Readiness dell'agente senza blocchi.
5. Prova reale sul canale o storefront pertinente.

Dominio di produzione: [litx-ai-agent-studio.vercel.app](https://litx-ai-agent-studio.vercel.app)

## Fonti di verita

- Il codice, lo schema Prisma, le migration e i test sono la verita eseguibile.
- `.env.example` descrive la configurazione supportata senza contenere segreti.
- `package.json` descrive i comandi disponibili.
- La knowledge base Obsidian privata conserva architettura, decisioni, stato e runbook aggiornati.
- La cronologia Git conserva i documenti storici rimossi; non devono essere usati come istruzioni operative correnti.
