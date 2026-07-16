# Migration Guide: Sistema Cognitivo con Memoria Strutturata

## 📋 Checklist Pre-Migrazione

- [ ] Backup del database corrente (`prisma/dev.db`)
- [ ] Verifica che Node.js >= 18.0.0
- [ ] Verifica variabili ambiente (`.env`)
- [ ] Stop del server di sviluppo

## 🔄 Step di Migrazione

### 1. Backup Database (CRITICO!)

```powershell
# Windows
Copy-Item prisma/dev.db prisma/dev.db.backup

# Verifica backup
Get-Item prisma/dev.db.backup
```

### 2. Genera e Applica Migration Prisma

```powershell
# Genera migration per nuovo schema
npm run prisma generate

# Applica migration al database
npm run db:push
```

**NOTA**: Il comando `db:push` è più veloce per sviluppo. In produzione usare `prisma migrate dev`.

### 3. Verifica Schema Database

```powershell
# Apri Prisma Studio per verificare
npm run db:studio
```

Dovresti vedere la nuova tabella `structured_facts` con questi campi:
- id, conversationId, botId
- factType, category, entityType, entityName, attribute, value
- confidence, source, extractedAt, validFrom, validUntil, isActive
- supersedes, supersededBy, embedding, embeddingModel
- intent, sentiment, importance
- rawText, extractionMethod, metadata

### 4. Testa Nuove Funzionalità

```powershell
# Avvia server
npm run dev

# In un altro terminale, testa l'API
node scripts/test-cognitive-system.js
```

### 5. Switch alla Nuova Route (Quando Pronto)

```powershell
# Rinomina vecchia route come backup
Move-Item app/api/chat/route.ts app/api/chat/route-old.ts

# Rinomina nuova route come main
Move-Item app/api/chat/route-new.ts app/api/chat/route.ts

# Riavvia server
npm run dev
```

## 🧪 Testing Checklist

### Test 1: Conversazione Base
- [ ] Saluto iniziale funziona
- [ ] Domanda semplice ottiene risposta
- [ ] Conversazione mantiene contesto

### Test 2: Estrazione Fatti
- [ ] Preferenza utente viene estratta e salvata
- [ ] Fact visibile in Prisma Studio (`structured_facts`)
- [ ] Fact ha embedding generato

### Test 3: Recupero Memoria
- [ ] In conversazione successiva, fatto viene ricordato
- [ ] Risposta personalizzata usando fatto memorizzato
- [ ] Validazione coerenza funziona

### Test 4: Multi-Dimensional Retrieval
- [ ] Domanda con entità specifica usa sia memoria che KB
- [ ] Intent conversazionale usa solo contesto
- [ ] Follow-up question usa memoria persistente

### Test 5: Validazione Coerenza
- [ ] Contraddizioni vengono rilevate
- [ ] Fatto più recente prevale su vecchio
- [ ] Coherence score calcolato correttamente

## 🔙 Rollback (Se Necessario)

```powershell
# Stop server
# Ctrl+C

# Ripristina database backup
Remove-Item prisma/dev.db
Copy-Item prisma/dev.db.backup prisma/dev.db

# Ripristina vecchia route
Remove-Item app/api/chat/route.ts
Move-Item app/api/chat/route-old.ts app/api/chat/route.ts

# Riavvia
npm run dev
```

## 📊 Monitoraggio Post-Migrazione

### Metriche da Monitorare

1. **Performance**
   - Tempo di risposta medio (target: < 3s)
   - Token usage (non dovrebbe aumentare significativamente)

2. **Qualità**
   - Coherence score medio (target: > 0.7)
   - Confidence score medio (target: > 0.6)

3. **Memoria**
   - Fatti estratti per conversazione (target: 2-5)
   - Fatti riutilizzati (recall rate)

4. **Errori**
   - Errori di validazione
   - Conflitti non risolti
   - Fallimenti estrazione

### Log da Osservare

```
✅ Indicatori di Successo:
- [Orchestrator] ========== NEW REQUEST ==========
- [Orchestrator] PHASE 1: UNDERSTANDING
- [Orchestrator] PHASE 2: DECISION
- [Orchestrator] PHASE 3: RETRIEVAL
- [Orchestrator] PHASE 4: VALIDATION
- [Orchestrator] PHASE 5: GENERATION
- [Orchestrator] PHASE 6: LEARNING
- [Orchestrator] ========== COMPLETED ==========

⚠️ Warning da Investigare:
- [CoherenceValidator] Low coherence detected
- [FactExtractor] Confidence too low
- [MultiDimRetrieval] No facts found

❌ Errori Critici:
- Error in coherence validation
- Error extracting facts
- Retrieval failed
```

## 🎯 Benefici Attesi

### Problemi Risolti

1. **Chatbot ignora contenuti KB**
   - ✅ Validazione coerenza previene uso di informazioni irrilevanti
   - ✅ Multi-dimensional retrieval migliora recall

2. **Risposte incoerenti**
   - ✅ Decision orchestrator mantiene strategia chiara
   - ✅ Validazione rileva contraddizioni

3. **Perdita contesto conversazione**
   - ✅ Memoria persistente salva informazioni importanti
   - ✅ Temporal index gestisce evoluzione nel tempo

4. **Allucinazioni**
   - ✅ Coherence checking prima di LLM
   - ✅ Source priority resolution (context > memory > KB)

### Nuove Capacità

1. **Personalizzazione**
   - Ricorda preferenze utente tra conversazioni
   - Risponde considerando storico utente

2. **Apprendimento Continuo**
   - Estrae fatti strutturati automaticamente
   - Normalizza entità per consistenza

3. **Decisioni Intelligenti**
   - Sceglie automaticamente quale fonte usare
   - Adatta strategia al tipo di query

4. **Qualità Misurabile**
   - Coherence score per ogni risposta
   - Metrics dettagliati per debugging

## 📚 Documentazione Tecnica

### Nuovi Moduli

- `lib/structured-memory.ts` - Gestione memoria multi-livello
- `lib/fact-extractor.ts` - Estrazione fatti con LLM
- `lib/multi-dimensional-retrieval.ts` - Recupero intelligente
- `lib/coherence-validator.ts` - Validazione coerenza
- `lib/decision-orchestrator.ts` - Orchestratore centrale

### Database Schema

- `StructuredFact` - Nuovo model per fatti strutturati
- Relazioni: Chatbot → StructuredFact ← Conversation

### API Changes

- Response include nuovi campi:
  - `decision` - Strategia decisionale usata
  - `memory` - Statistiche uso memoria
  - `validation` - Risultati validazione coerenza
  - `confidence.coherenceScore` - Score coerenza

## ❓ FAQ

**Q: La migrazione cancella i dati esistenti?**
A: No, aggiunge solo nuove tabelle. Conversazioni e messaggi esistenti rimangono intatti.

**Q: Posso usare sia vecchia che nuova route?**
A: Sì, route-old.ts rimane disponibile come fallback.

**Q: Performance degraderà?**
A: Inizialmente +500-1000ms per fase di validazione, ma migliora qualità risposte.

**Q: Come verifico che funziona?**
A: Guarda i log per "PHASE 1-6" completate e verifica structured_facts in DB.

**Q: Cosa fare se va male?**
A: Usa procedura rollback sopra. Backup database è critico.

## 🚀 Next Steps (Post-Migrazione)

1. **Settimana 1**: Monitoraggio intensivo, fine-tuning parametri
2. **Settimana 2**: A/B testing vecchia vs nuova route
3. **Settimana 3**: Ottimizzazione performance (caching, indexing)
4. **Settimana 4**: Rimozione route vecchia, full deployment

## 📞 Support

In caso di problemi durante migrazione:
1. Controlla logs console per errori specifici
2. Verifica schema database con `prisma studio`
3. Testa singoli moduli isolatamente
4. Rollback se necessario e debug offline
