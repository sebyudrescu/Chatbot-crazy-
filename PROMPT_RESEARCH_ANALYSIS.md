# 🔍 Analisi Ricerca su Prompting - Best Practice

## 📚 Dalla Tua Ricerca

### **1. Struttura del Prompt Perfetto**

**Elementi essenziali:**
- ✅ **Ruolo chiaro** - "Sei un assistente clienti AI"
- ✅ **Regole precise** - "Rispondi solo se l'informazione è confermata dalla knowledge base"
- ✅ **Stile definito** - "usa tono professionale", "riporta le fonti"
- ✅ **Gestione fallback** - "ammettilo e suggerisci di trasferire la richiesta"

**Esempio dalla ricerca:**
```
"Sei un assistente virtuale per supporto clienti. 
Usa solo i dati forniti e rispondi in modo chiaro. 
Se non conosci la risposta esatta, ammettilo e suggerisci 
di trasferire la richiesta a un operatore umano."
```

---

### **2. Esempi Negativi (Anti-Allucinazione)**

**Dalla ricerca:**
> "inserire esempi negativi nel prompt (istruzioni su cosa non fare)"

**Esempio:**
```
"Non dire che consegniamo pizza cifrata con quantum encryption, 
perché vendiamo software enterprise"
```

**Perché funziona:**
- Il modello apprende cosa NON dire
- Previene allucinazioni specifiche al dominio
- Riduce creatività fuori contesto

---

### **3. Verifica Post-Output (LLM-as-Judge)**

**Dalla ricerca:**
> "rispedire la risposta generata a un secondo modello per confrontarla 
> con la knowledge base"

**Pattern:**
```
1. Genera risposta
2. Passa a secondo LLM: "Controlla se le seguenti affermazioni 
   contraddicono i dati forniti"
3. Se contraddizioni → fallback o rigenerazione
```

**Nota:** Implementabile come feature avanzata (double-check)

---

### **4. Regole Rigide & Vincoli**

**Dalla ricerca:**
> "Rispondi utilizzando solo le informazioni qui sotto, fra virgolette 
> se citi la knowledge base"

**Pattern:**
- Formato vincolato (elenchi puntati, JSON)
- Citazione obbligatoria (fra virgolette)
- Rifiuto domande fuori dominio

**Esempio Intercom Fin:**
> "rifiuta domande fuori dominio e riporta sempre le fonti consultate"

---

### **5. Tone & Style Specifico**

**Dalla ricerca:**
- Tono professionale
- Chiaro e conciso
- Riporta fonti
- Ammette quando non sa

**Variazioni per tipo agente:**
- **Supporto**: empatico, paziente, risolutivo
- **Vendite**: persuasivo, entusiasta, value-focused
- **Consulenza**: esperto, analitico, consulenziale
- **Tecnico**: preciso, dettagliato, step-by-step

---

## 🎯 Principi per i Template

Basandomi sulla ricerca, ogni template avrà:

### **Struttura Standard:**
```
1. IDENTITÀ & RUOLO
   - Chi sei
   - Per chi lavori
   - Cosa fai

2. FONTI & KNOWLEDGE BASE
   - Come accedi alle informazioni
   - Dove sono le fonti
   - Formato fonti

3. REGOLE ASSOLUTE (NON VIOLARE)
   - Usa SOLO KB
   - NON inventare
   - Cita sempre fonti
   - Ammetti quando non sai

4. ESEMPI NEGATIVI
   - Cosa NON fare
   - Cosa NON dire
   - Errori comuni da evitare

5. STILE & TONO
   - Come comunicare
   - Formato risposte
   - Lunghezza

6. GESTIONE FALLBACK
   - Quando non sai
   - Come escalare
   - Alternative

7. PERSONALIZZAZIONE (se dati disponibili)
   - Usa preferenze utente
   - Ricorda contesto
   - Adatta tono
```

---

## 📊 Matrice Template da Creare

| Template | Tono | Focus | Use Case |
|----------|------|-------|----------|
| **Supporto Clienti** | Empatico, Paziente | Problem-solving | Assistenza tecnica, troubleshooting |
| **Vendite** | Persuasivo, Entusiasta | Value proposition | Lead qualification, product info |
| **Consulenza** | Esperto, Analitico | Advisory | Strategic guidance, recommendations |
| **Informativo/FAQ** | Neutro, Chiaro | Information delivery | Knowledge sharing, documentation |
| **Educational** | Didattico, Incoraggiante | Teaching | Training, onboarding, tutorials |
| **Tecnico/Dev** | Preciso, Dettagliato | Technical accuracy | API docs, code examples, debugging |
| **Custom** | - | - | Compilato dall'utente |

---

## 🔧 Best Practice da Applicare

### **1. Specificità > Genericità**
❌ "Sei un assistente AI"
✅ "Sei un assistente AI specializzato nel supporto tecnico per software SaaS B2B"

### **2. Esempi Concreti**
❌ "Non inventare"
✅ "Non dire che offriamo un piano gratuito illimitato, perché la trial dura 14 giorni"

### **3. Formato Output Vincolato**
❌ "Rispondi alle domande"
✅ "Rispondi in max 3-4 frasi. Inizia con la risposta diretta, poi aggiungi dettagli se necessario. Cita sempre la fonte."

### **4. Gestione Incertezza**
❌ "Se non sai, dillo"
✅ "Se la confidence è <70% o le fonti non contengono la risposta, rispondi: 'Non ho informazioni sufficienti nella knowledge base per rispondere con certezza. Posso metterti in contatto con il supporto umano?'"

### **5. Context Awareness**
❌ "Usa le informazioni"
✅ "Se l'utente ha già espresso preferenze (es: preferisce PayPal), menzionale nella risposta per personalizzare"

---

## ✨ Innovazioni da Includere

Oltre alla tua ricerca, aggiungo:

### **A) Structured Output**
```
Formato JSON per risposte verificabili:
{
  "answer": "...",
  "sources": ["source1", "source2"],
  "confidence": 0.85,
  "requiresHumanEscalation": false
}
```

### **B) Multi-Stage Response**
```
1. Analisi query (intent detection)
2. Controllo KB availability
3. Risposta o fallback
4. Post-verifica (opzionale)
```

### **C) Dynamic Prompt Injection**
```
Base prompt + [Conversation facts] + [RAG sources] + [User query]
→ Personalizzazione contestuale automatica
```

---

## 🎯 Prossimo: Creazione Template

Con questa analisi, creo ora **7 template professionali** che implementano tutte queste best practice!
