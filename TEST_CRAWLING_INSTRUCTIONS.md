# 🧪 Istruzioni Test Crawling Real-Time

## ✅ Come Testare la Nuova Implementazione

### **STEP 1: Accedi alla Setup Page**
```
1. Apri browser: http://localhost:3000/dashboard
2. Click sul pulsante "Setup" di un chatbot esistente
   OPPURE
3. Crea un nuovo chatbot e verrai reindirizzato automaticamente
```

### **STEP 2: Vai al Tab Knowledge**
```
1. Nella pagina Setup, click sul tab "Knowledge Base" (viola)
2. Dovresti vedere 2 riquadri:
   - 📄 Carica PDF
   - 🌐 Aggiungi Sito Web
```

### **STEP 3: Inserisci URL per Test**
```
URL Test Consigliati (veloci):
  ✅ https://example.com (1 pagina, veloce)
  ✅ https://docs.python.org/3/ (multi-page, completo)
  
Modalità:
  • Singola Pagina: Solo 1 pagina (test veloce ~10 secondi)
  • Intero Sito: Max 50 pagine (test completo ~2-3 minuti)

SCEGLI: "Singola Pagina" per test veloce
```

### **STEP 4: Click "Scansiona Sito" o "Aggiungi URL"**
```
COSA DOVRESTI VEDERE IMMEDIATAMENTE:

┌────────────────────────────────────────────┐
│ 🔄 Inizializzazione...           0%       │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0%       │
│                                            │
│ 🔍 Preparing...                            │
│ I documenti appariranno sotto ↓            │
└────────────────────────────────────────────┘
```

### **STEP 5: Osserva il Progress**
```
DOVRESTI VEDERE LA BARRA CRESCERE:

5 secondi dopo:
┌────────────────────────────────────────────┐
│ 🔄 Crawling pages...        30%           │
│ ████████████░░░░░░░░░░░░░░░░░░  30%       │
│ 🔍 Crawling pages...                      │
└────────────────────────────────────────────┘

15 secondi dopo:
┌────────────────────────────────────────────┐
│ 🔄 Processing page 1/1...   65%           │
│ ████████████████████████░░░░░░  65%       │
│ ⚙️ Processing documents...                │
└────────────────────────────────────────────┘

20 secondi dopo:
┌────────────────────────────────────────────┐
│ ✅ Completato!              100%          │
│ ██████████████████████████████  100%      │
│ ✅ Complete!                               │
└────────────────────────────────────────────┘
```

### **STEP 6: Verifica Documenti Sotto**
```
DOVRESTI VEDERE:

📚 Documenti Caricati (1)

┌─────────────────────────────────────────┐
│ 🌐 https://example.com                  │
│ ✓ 15 chunks | 6 gen 2026               │
│                                  [❌]   │
└─────────────────────────────────────────┘

✅ Il documento è apparso automaticamente!
✅ Nessun refresh necessario!
✅ Nessun redirect a /jobs!
```

---

## ❌ Possibili Problemi e Soluzioni

### **Problema 1: Progress Bar Non Appare**
```
CAUSA: JavaScript error o browser non supporta SSE
SOLUZIONE:
  1. Apri DevTools (F12)
  2. Guarda tab Console per errori
  3. Verifica Network tab per la richiesta a /crawl-with-progress
  4. Ricarica la pagina
```

### **Problema 2: Progress Si Blocca al 30%**
```
CAUSA: Firecrawl rate limit o API key invalida
SOLUZIONE:
  1. Controlla console server (terminal dove gira npm run dev)
  2. Verifica che FIRECRAWL_API_KEY sia valida in .env
  3. Aspetta 60 secondi e riprova (rate limit)
  4. Prova con "Singola Pagina" invece di "Intero Sito"
```

### **Problema 3: Documenti Non Appaiono**
```
CAUSA: Polling non attivo o errore nel processing
SOLUZIONE:
  1. Attendi 10 secondi dopo il completamento
  2. Ricarica manualmente la pagina
  3. Controlla console server per errori "processAndStoreDocument"
  4. Verifica che OPENAI_API_KEY sia valida (serve per embeddings)
```

### **Problema 4: Errore "Failed to start crawl"**
```
CAUSA: API endpoint non trovato o errore server
SOLUZIONE:
  1. Verifica che il file esista:
     app/api/knowledge-sources/crawl-with-progress/route.ts
  2. Riavvia server Next.js:
     - Stop server (Ctrl+C)
     - npm run dev
  3. Attendi compilazione completa
  4. Riprova
```

---

## 🔍 Debug - Cosa Guardare

### **Console Browser (F12 → Console)**
```javascript
// DOVRESTI VEDERE:
"SSE data received: {type: 'start', progress: 0}"
"SSE data received: {type: 'crawling', progress: 10}"
"SSE data received: {type: 'processing', progress: 45, currentPage: 5}"
"SSE data received: {type: 'complete', progress: 100}"

// SE VEDI ERRORI:
"Failed to parse SSE data" → Problema nel parsing JSON
"Network error" → Problema di connessione al server
```

### **Network Tab (F12 → Network)**
```
CERCA: crawl-with-progress

DOVRESTI VEDERE:
  Method: POST
  Status: 200 OK
  Type: text/event-stream
  Size: (stream) - continua a crescere
  Time: 20-60 secondi (dipende da quante pagine)
```

### **Server Console (Terminal)**
```bash
# DOVRESTI VEDERE:
[Crawl] Starting crawl for: https://example.com
[Crawl] Using provider: Firecrawl (HTTP)
[Firecrawl HTTP] Starting crawl job...
[Firecrawl HTTP] ✅ Job started: 019b9061-5528-712e
[Firecrawl HTTP] ✅ Crawl completed successfully
[Process] Processing: https://example.com
🔄 Processing document sourceId for bot botId
📄 Created 15 chunks
✅ Successfully processed document
```

---

## ✅ Test di Successo - Checklist

Dopo il test, verifica che:

- [ ] Progress bar è apparsa immediatamente (0%)
- [ ] Percentuale è cresciuta da 0% a 100%
- [ ] Status text è cambiato (Preparing → Crawling → Processing → Complete)
- [ ] Nessun redirect a /jobs è avvenuto
- [ ] Sei rimasto sulla pagina /setup
- [ ] Documenti sono apparsi sotto automaticamente
- [ ] Documenti mostrano status "completed" e chunk count
- [ ] Pulsante "Continua al Test" si è abilitato
- [ ] Messaggio di successo "✅ Completato!" è apparso

**SE TUTTI I PUNTI SONO ✅ → IMPLEMENTAZIONE FUNZIONA AL 100%!**

---

## 🎯 Test Avanzati (Opzionale)

### **Test 1: Multi-Page Crawl**
```
URL: https://docs.python.org/3/tutorial/
Modalità: Intero Sito (max 50 pagine)
Tempo atteso: 2-3 minuti

VERIFICA:
  • Progress incrementa per ogni pagina (30% → 40% → 50% etc.)
  • Status mostra "Processing page X/Y"
  • Tutti i documenti appaiono sotto man mano
```

### **Test 2: Single Page Speed**
```
URL: https://example.com
Modalità: Singola Pagina
Tempo atteso: 10-15 secondi

VERIFICA:
  • Progress salta velocemente (0% → 30% → 100%)
  • Solo 1 documento appare
```

### **Test 3: Errore Handling**
```
URL: https://sito-che-non-esiste-12345.com
Modalità: Qualsiasi

VERIFICA:
  • Errore viene mostrato
  • Progress bar si ferma
  • Messaggio di errore chiaro
```

---

## 📞 Se Qualcosa Non Funziona

**Raccogli queste informazioni:**
1. Screenshot della progress bar
2. Console errors (F12 → Console)
3. Network requests (F12 → Network)
4. Server logs (dal terminal)

**Poi dimmi cosa vedi e ti aiuto a fixare!**

---

**Buon Test! 🚀**
