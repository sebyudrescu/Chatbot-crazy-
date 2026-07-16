# 📊 Analisi Parametri OpenAI - Sistema RAG

## ✅ PARAMETRI GIÀ IMPLEMENTATI

### 1. **Temperature** (Parzialmente Implementato)

**Dove:**
- `app/api/chat/route.ts` linea 345: `temperature: 0.1` (RAG answer)
- `app/api/chat/route.ts` linea 392: `temperature: 0.7` (General AI)
- `lib/intent-classifier.ts` linea 143: `temperature: 0.0` (Intent classification)

**Strategia Attuale:**
- ✅ RAG answer: 0.1 (molto deterministico per risposte fattuali)
- ✅ General AI: 0.7 (più creativo per conversazioni)
- ✅ Intent classifier: 0.0 (massima precisione)

**⚠️ MANCANTE:**
- Temperature dinamica basata su tipo di query
- Classificazione query fattuali vs creative
- Parametrizzazione per template diversi

---

### 2. **Max Tokens** (Implementato Base)

**Dove:**
- Tutti gli endpoint usano `max_tokens: 500` fisso

**Strategia Attuale:**
- ✅ Limite base implementato (500 tokens)

**⚠️ MANCANTE:**
- Configurazione dinamica per risposte lunghe/corte
- Limite diverso per intent diversi
- Gestione risposte complesse (potrebbero servire 1024 tokens)

---

### 3. **Top_p** (NON Implementato)

**Stato:** ❌ NON PRESENTE

**Default OpenAI:** 1.0 (sampling completo)

**⚠️ MANCANTE:**
- Controllo nucleus sampling
- Bilanciamento con temperature

---

### 4. **Presence Penalty** (NON Implementato)

**Stato:** ❌ NON PRESENTE

**Default OpenAI:** 0.0

**⚠️ MANCANTE:**
- Controllo ripetizioni concetti
- Varietà linguistica

---

### 5. **Frequency Penalty** (NON Implementato)

**Stato:** ❌ NON PRESENTE

**Default OpenAI:** 0.0

**⚠️ MANCANTE:**
- Controllo ripetizioni parole
- Riduzione frasi ripetitive (es: "gentile cliente" ripetuto)

---

## 🎯 PIANO DI IMPLEMENTAZIONE

### **Priority 1: Temperature Dinamica** ⭐⭐⭐

**Implementare:**
1. Classificatore query fattuali vs creative
2. Temperature adapter basato su intent
3. Configurazione per template

**Logica:**
```typescript
if (isFactualQuery) {
  temperature = 0.0-0.3  // "Qual è lo stato ordine?"
} else if (isCreativeQuery) {
  temperature = 0.7-1.0  // "Suggerisci claim pubblicitari"
} else {
  temperature = 0.5      // default conversazionale
}
```

**Pattern Keywords:**
- Fattuale: "quanto", "quando", "dove", "quale", "chi", "stato", "prezzo", "costo"
- Creativa: "suggerisci", "crea", "genera", "proponi", "idea", "possibile"

---

### **Priority 2: Max Tokens Dinamico** ⭐⭐

**Implementare:**
- Intent "question" semplice: 256 tokens
- Domande complesse: 512 tokens
- Richieste creative/dettagliate: 1024 tokens
- Escalation/chitchat: 150 tokens

**Logica:**
```typescript
switch (intent) {
  case 'greeting': maxTokens = 150
  case 'chitchat': maxTokens = 200
  case 'question': 
    if (isComplexQuery) maxTokens = 1024
    else maxTokens = 512
  case 'creative': maxTokens = 1024
}
```

---

### **Priority 3: Presence/Frequency Penalty** ⭐

**Implementare:**
- Presence penalty: 0.3 (evita ripetizioni concetti)
- Frequency penalty: 0.5 (evita ripetizioni parole)

**Solo per:**
- Risposte lunghe (> 300 tokens)
- Template verbose (customer-support)

**Logica:**
```typescript
if (responseLength > 300 || template === 'customer-support') {
  presencePenalty = 0.3
  frequencyPenalty = 0.5
}
```

---

### **Priority 4: Top_p Configurabile** ⭐

**Implementare:**
- Default: 1.0 (sampling completo)
- Per risposte deterministiche: 0.9 + temperature=0.1

**Logica:**
```typescript
if (temperature < 0.3) {
  topP = 0.9  // più focus su token probabili
} else {
  topP = 1.0  // sampling completo
}
```

---

## 📋 STRUTTURA IMPLEMENTAZIONE

### **Step 1: Query Classifier**

Creare `lib/query-classifier.ts`:
```typescript
interface QueryClassification {
  type: 'factual' | 'creative' | 'conversational'
  complexity: 'simple' | 'medium' | 'complex'
  suggestedParams: {
    temperature: number
    maxTokens: number
    topP: number
    presencePenalty: number
    frequencyPenalty: number
  }
}
```

### **Step 2: Parameter Manager**

Creare `lib/openai-params-manager.ts`:
```typescript
function getOptimalParams(
  intent: IntentType,
  queryClassification: QueryClassification,
  templateId: string
): OpenAIParams
```

### **Step 3: Integrazione Chat API**

Modificare `app/api/chat/route.ts`:
```typescript
const queryClass = classifyQuery(message)
const params = getOptimalParams(intent, queryClass, templateId)

const completion = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [...],
  ...params  // temperature, maxTokens, topP, penalties
})
```

---

## 💰 IMPATTO BUDGET TOKEN

### **Prima (senza ottimizzazione):**
- Risposta media: 500 tokens
- 1000 richieste/giorno = 500,000 tokens/giorno
- Costo: ~$0.75/giorno

### **Dopo (con ottimizzazione):**
- Greeting: 150 tokens (-70%)
- Chitchat: 200 tokens (-60%)
- Question semplice: 256 tokens (-49%)
- Question complessa: 512 tokens (uguale)
- Media: ~300 tokens

**Risparmio stimato: 40% token usage = ~$0.30/giorno risparmiato**

Su 30 giorni = **$9/mese risparmiato** per bot

---

## 🧪 TEST PLAN

### **Test Case 1: Query Fattuali**
```
Input: "Quanto costa il piano Pro?"
Expected: temperature=0.1, maxTokens=256
```

### **Test Case 2: Query Creative**
```
Input: "Suggerisci 5 claim pubblicitari per il nostro prodotto"
Expected: temperature=0.9, maxTokens=1024
```

### **Test Case 3: Greeting**
```
Input: "Ciao"
Expected: temperature=0.5, maxTokens=150
```

### **Test Case 4: Query Complessa**
```
Input: "Spiegami dettagliatamente come funziona il sistema di abbonamenti e quali sono tutte le differenze tra i piani"
Expected: temperature=0.3, maxTokens=1024
```

---

## ✅ CHECKLIST IMPLEMENTAZIONE

- [ ] Creare `lib/query-classifier.ts`
- [ ] Creare `lib/openai-params-manager.ts`
- [ ] Modificare `app/api/chat/route.ts` per usare params dinamici
- [ ] Aggiungere presence_penalty e frequency_penalty
- [ ] Configurare top_p dinamico
- [ ] Testare con varie query
- [ ] Monitorare token usage
- [ ] Documentare parametri per ogni template

---

**Aggiornato:** 2026-01-05
