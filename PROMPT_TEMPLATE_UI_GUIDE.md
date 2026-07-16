# 🎨 Guida UI Template dei Prompt - Implementazione Completa

## ✅ Implementazione Completata

### 📋 Componenti Creati

#### 1. **PromptTemplateSelector Component** (`components/PromptTemplateSelector.tsx`)

Componente React riutilizzabile per la selezione e configurazione dei template dei prompt.

**Funzionalità:**
- ✨ **Selezione Template**: Mostra tutti i 7 template disponibili con icone colorate
- 🎯 **Categorizzazione**: Template organizzati per categoria (support, sales, consulting, etc.)
- 📝 **Variabili Dinamiche**: Form automatico per le variabili del template (es. COMPANY_NAME, PRODUCT_NAME)
- ✏️ **Prompt Personalizzato**: Modalità per scrivere un system prompt completamente custom
- 👁️ **Preview in Tempo Reale**: Bottone per visualizzare l'anteprima del prompt finale
- 🔄 **Anteprima Template**: Expand/collapse per vedere il contenuto di ogni template

**Props:**
```typescript
interface PromptTemplateSelectorProps {
  selectedTemplateId?: string | null
  customPrompt?: string | null
  promptVariables?: Record<string, string> | null
  companyName: string
  onTemplateChange: (templateId: string | null) => void
  onCustomPromptChange: (prompt: string | null) => void
  onVariablesChange: (variables: Record<string, string>) => void
  disabled?: boolean
}
```

**Caratteristiche UI:**
- 🎨 Design moderno con colori per categoria
- 📱 Responsive e mobile-friendly
- ♿ Accessibile e keyboard-friendly
- 🔄 Loading states e animazioni
- 🎯 Focus states chiari

---

#### 2. **Dashboard Integrata** (`app/dashboard/page.tsx`)

La dashboard è stata completamente aggiornata con:

**Modal di Creazione Chatbot:**
- 📝 Form step-by-step intuitivo
- 🏢 Input nome azienda
- 🎯 Selezione template integrata
- ✨ Validazione real-time
- 🔄 Loading states durante la creazione

**Flusso Utente:**
1. Clicca "Nuovo Chatbot" o "Crea Primo Agente"
2. Si apre modal con form
3. Inserisce nome azienda
4. Sceglie tra:
   - **Template Predefinito**: Seleziona uno dei 7 template
   - **Prompt Personalizzato**: Scrive il proprio prompt
5. Se usa template, compila le variabili richieste
6. Visualizza anteprima (opzionale)
7. Clicca "Crea Chatbot"

---

## 🎯 Feature #5: Preview in Tempo Reale - Spiegazione

### Cosa significa "Preview in Tempo Reale"?

La **preview in tempo reale** è una funzionalità che permette all'utente di vedere **esattamente** come sarà il prompt finale prima di salvare il chatbot.

### Come Funziona:

#### 1. **Bottone "Anteprima Prompt Finale"**
```tsx
<button onClick={handlePreview}>
  <Eye className="w-4 h-4" />
  Anteprima Prompt Finale
</button>
```

#### 2. **Elaborazione Lato Client + Server**
Quando l'utente clicca il bottone:

**Se Modalità Template:**
```typescript
// Chiama API per riempire i placeholder
POST /api/prompt-templates/preview
Body: {
  templateId: "customer-support",
  variables: { 
    COMPANY_NAME: "Acme Corp",
    PRODUCT_NAME: "Super Widget"
  }
}

// Risposta:
{
  filledPrompt: "Sei un assistente AI per Acme Corp. 
                 Il tuo prodotto principale è Super Widget..."
}
```

**Se Modalità Custom:**
```typescript
// Mostra direttamente il prompt custom
setPreviewPrompt(customPrompt)
```

#### 3. **Modal di Anteprima**
Un modal full-screen mostra:
- Il prompt **esattamente** come verrà inviato a OpenAI
- Tutte le variabili sostituite con i valori reali
- Formattazione markdown preservata
- Scrollabile per prompt lunghi

### Esempio Visivo:

**Prima della preview:**
```
Template: Customer Support
Variables:
  - COMPANY_NAME: "Acme Corp"
```

**Dopo click su "Anteprima":**
```
╔══════════════════════════════════════╗
║     Anteprima System Prompt          ║
╠══════════════════════════════════════╣
║                                      ║
║ # IDENTITÀ E RUOLO                   ║
║ Sei un assistente AI specializzato   ║
║ nel supporto clienti per Acme Corp.  ║
║                                      ║
║ # REGOLE ASSOLUTE                    ║
║ 1. USA SOLO LA KNOWLEDGE BASE        ║
║ 2. CITA SEMPRE LE FONTI              ║
║ ...                                  ║
║                                      ║
║         [Chiudi]                     ║
╚══════════════════════════════════════╝
```

### Vantaggi per l'Utente:

✅ **Trasparenza**: Vede esattamente cosa riceverà l'AI  
✅ **Validazione**: Può verificare che le variabili siano corrette  
✅ **Sicurezza**: Evita errori prima di salvare  
✅ **Apprendimento**: Capisce come funzionano i template  
✅ **Debug**: Facilita troubleshooting se il bot non si comporta come previsto  

### Tecnologia Utilizzata:

1. **API Endpoint**: `/api/prompt-templates/preview` (POST)
2. **Funzione Core**: `fillTemplatePlaceholders()` in `lib/prompt-templates.ts`
3. **Modal React**: Component state con `showPreview`
4. **Styling**: Tailwind con `fixed inset-0` per overlay full-screen

---

## 🚀 Come Usare la Nuova UI

### Per Utenti:

1. **Vai alla Dashboard**: http://localhost:3000/dashboard
2. **Clicca "Nuovo Chatbot"**
3. **Inserisci Nome Azienda**: Es. "Acme Corporation"
4. **Scegli il Template**:
   - Clicca su "Usa Template Predefinito"
   - Sfoglia i 7 template disponibili
   - Clicca su quello desiderato (es. "Customer Support")
5. **Compila Variabili**:
   - Il form si aggiorna automaticamente
   - COMPANY_NAME è già pre-compilato
   - Aggiungi altre variabili se richieste
6. **Visualizza Anteprima** (opzionale):
   - Clicca "Anteprima Prompt Finale"
   - Verifica che tutto sia corretto
7. **Crea il Chatbot**:
   - Clicca "Crea Chatbot"
   - Ricevi conferma di successo!

### Per Sviluppatori:

**Riutilizzare il Component:**
```tsx
import PromptTemplateSelector from '@/components/PromptTemplateSelector'

function MyForm() {
  const [templateId, setTemplateId] = useState(null)
  const [customPrompt, setCustomPrompt] = useState(null)
  const [variables, setVariables] = useState({})

  return (
    <PromptTemplateSelector
      selectedTemplateId={templateId}
      customPrompt={customPrompt}
      promptVariables={variables}
      companyName="My Company"
      onTemplateChange={setTemplateId}
      onCustomPromptChange={setCustomPrompt}
      onVariablesChange={setVariables}
    />
  )
}
```

**Accedere ai Template via API:**
```typescript
// GET all templates
const res = await fetch('/api/prompt-templates')
const { data } = await res.json()
console.log(data.templates) // Array di 7 template

// GET specific template
const res = await fetch('/api/prompt-templates?id=customer-support')
const { data } = await res.json()
console.log(data.name) // "Supporto Clienti"

// Preview with variables
const res = await fetch('/api/prompt-templates/preview', {
  method: 'POST',
  body: JSON.stringify({
    templateId: 'sales-assistant',
    variables: { COMPANY_NAME: 'Acme', PRODUCT_NAME: 'Widget' }
  })
})
const { data } = await res.json()
console.log(data.filledPrompt) // Prompt completo
```

---

## 📊 Template Disponibili

| ID | Nome | Categoria | Icona | Variabili |
|----|------|-----------|-------|-----------|
| customer-support | Supporto Clienti | support | 🛠️ | COMPANY_NAME |
| sales-assistant | Assistente Vendite | sales | 💼 | COMPANY_NAME, PRODUCT_NAME |
| consulting-expert | Esperto Consulenza | consulting | 🎯 | COMPANY_NAME, INDUSTRY |
| informative-bot | Assistente Informativo | informative | 📚 | COMPANY_NAME, TOPIC |
| educational-tutor | Tutor Educativo | educational | 🎓 | SUBJECT, LEVEL |
| technical-docs | Documentazione Tecnica | technical | 🔧 | PRODUCT_NAME, VERSION |
| custom-agent | Agente Personalizzato | custom | ✨ | Nessuna |

---

## 🎨 Design System

### Colori per Categoria:
- **Support**: Blu (`bg-blue-100 text-blue-800`)
- **Sales**: Verde (`bg-green-100 text-green-800`)
- **Consulting**: Viola (`bg-purple-100 text-purple-800`)
- **Informative**: Giallo (`bg-yellow-100 text-yellow-800`)
- **Educational**: Rosa (`bg-pink-100 text-pink-800`)
- **Technical**: Grigio (`bg-gray-100 text-gray-800`)
- **Custom**: Arancione (`bg-orange-100 text-orange-800`)

### Icone Lucide React:
- Wrench (🛠️), DollarSign (💼), Target (🎯), BookOpen (📚)
- GraduationCap (🎓), Code (🔧), Sparkles (✨)

---

## 🔄 Flusso Dati Completo

```
User Input
    ↓
Dashboard (State Management)
    ↓
PromptTemplateSelector Component
    ↓
API: /api/prompt-templates (GET all)
    ↓
User Selects Template
    ↓
PromptTemplateSelector (Fill Variables)
    ↓
Preview Button Click
    ↓
API: /api/prompt-templates/preview (POST)
    ↓
lib/prompt-manager.ts (fillTemplatePlaceholders)
    ↓
Show Preview Modal
    ↓
User Confirms
    ↓
Dashboard: createChatbot()
    ↓
API: /api/chatbots (POST with template data)
    ↓
Database: Save with promptTemplateId + variables
    ↓
Chat: Load template and generate system prompt
    ↓
OpenAI: Use generated prompt in conversation
```

---

## ✨ Funzionalità Extra Implementate

1. **Expand/Collapse Template**: Vedere contenuto prima di selezionare
2. **Disabilitazione durante creazione**: UI disabled con loading spinner
3. **Validazione form**: Nome azienda obbligatorio
4. **Reset automatico**: Form pulito dopo creazione
5. **Conferma visiva**: Alert di successo/errore
6. **Responsive design**: Funziona su mobile/tablet/desktop
7. **Keyboard navigation**: Accessibile con tastiera
8. **Error handling**: Gestione errori API

---

## 🐛 Testing Checklist

- [x] Build TypeScript passa senza errori
- [x] API `/api/prompt-templates` funziona
- [x] API `/api/prompt-templates/preview` funziona
- [x] Modal si apre/chiude correttamente
- [x] Template selection funziona
- [x] Variabili form si aggiorna dinamicamente
- [x] Preview mostra prompt corretto
- [x] Custom prompt mode funziona
- [x] Creazione chatbot salva dati correttamente
- [ ] Test E2E: Creare chatbot con template
- [ ] Test E2E: Creare chatbot con custom prompt
- [ ] Test: Modificare chatbot esistente

---

## 🚀 Prossimi Miglioramenti Possibili

1. **Edit Chatbot**: Modal simile per modificare chatbot esistenti
2. **Template Marketplace**: Condividere template tra utenti
3. **Template Builder**: UI per creare nuovi template
4. **A/B Testing**: Testare diversi prompt
5. **Analytics**: Vedere performance per template
6. **Import/Export**: Backup template personalizzati
7. **Versioning**: Storico modifiche prompt

---

## 📖 Documentazione API

### GET /api/prompt-templates
Ottieni tutti i template disponibili

**Response:**
```json
{
  "success": true,
  "data": {
    "templates": [...],
    "categories": ["support", "sales", ...],
    "totalCount": 7
  }
}
```

### POST /api/prompt-templates/preview
Anteprima prompt con variabili compilate

**Request:**
```json
{
  "templateId": "customer-support",
  "variables": {
    "COMPANY_NAME": "Acme Corp"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "template": {...},
    "filledPrompt": "Sei un assistente AI...",
    "placeholders": ["COMPANY_NAME"]
  }
}
```

---

✅ **Implementazione UI Template dei Prompt Completata!**
