# Collegamento WhatsApp e Instagram tramite Meta

LitX usa i flussi ufficiali Meta. Le credenziali tecniche appartengono alla piattaforma LitX e si configurano una sola volta. Il cliente non deve consegnare password, App Secret o access token.

## Esperienza del cliente

1. In LitX si seleziona l'agente del cliente e si apre **Canali**.
2. Si sceglie WhatsApp o Instagram e si preme **Continua con Meta**.
3. Il cliente accede nella finestra ufficiale Meta.
4. Il cliente seleziona il proprio Business Account, account professionale e numero.
5. LitX scambia il codice temporaneo sul server, cifra il token e collega il webhook.

Per Instagram, LitX iscrive automaticamente l'account professionale agli eventi `messages` e `messaging_postbacks` tramite `/{ig_user_id}/subscribed_apps`; il solo login OAuth non è considerato un collegamento completato.

Il proprietario può anche generare da **Canali > Configura > Collegamento assistito cliente** un link firmato valido 30 minuti. Il cliente apre una pagina pubblica limitata al solo collegamento Meta: non vede la dashboard, non conosce la password di LitX e non deve inviare credenziali tramite chat o email.

Il link contiene soltanto agente, provider, emissione e scadenza, è protetto con HMAC e viene rifiutato se modificato, scaduto o già utilizzato. Dopo il collegamento, la pagina mostra esclusivamente la conferma e può essere chiusa.

La stessa risorsa Meta non può essere collegata contemporaneamente a due agenti. Quando un canale viene disconnesso, LitX elimina il token cifrato locale e richiede anche la rimozione della sottoscrizione webhook a Meta. Un token scaduto non viene mostrato come connessione attiva e il canale può essere autorizzato nuovamente dal cliente.

## Configurazione iniziale del proprietario

Nel portale Meta for Developers:

1. Crea un'app aziendale associata al Business Portfolio che gestisce LitX.
2. Aggiungi WhatsApp e Facebook Login for Business.
3. Crea una configurazione **WhatsApp Embedded Signup** e conserva il Configuration ID.
4. Aggiungi `litx-ai-agent-studio.vercel.app` tra i domini consentiti.
5. Configura il webhook HTTPS:

   `https://litx-ai-agent-studio.vercel.app/api/meta/webhook/messages`

6. Usa lo stesso valore segreto configurato in `META_VERIFY_TOKEN` per la verifica del webhook.
7. Sottoscrivi almeno il campo `messages` per WhatsApp e gli eventi di messaggistica necessari per Instagram.

## Variabili protette Vercel

Imposta nell'ambiente Production:

```env
NEXT_PUBLIC_APP_URL="https://litx-ai-agent-studio.vercel.app"
META_APP_ID="..."
META_APP_SECRET="..."
META_GRAPH_API_VERSION="vXX.0"
META_WHATSAPP_CONFIG_ID="..."
META_VERIFY_TOKEN="..."
META_TOKEN_ENCRYPTION_KEY="..."
```

`META_TOKEN_ENCRYPTION_KEY` deve rappresentare esattamente 32 byte codificati Base64. Generala localmente con:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Se Instagram usa un'app separata, configura anche `META_INSTAGRAM_APP_ID` e `META_INSTAGRAM_APP_SECRET`. Se sono assenti, LitX usa l'App ID e il segreto Meta principali.

Non inserire mai App Secret, token o chiavi di cifratura nel browser, nel repository Git o nei dati del cliente.

## Attivazione per clienti reali

Per collegare Business Account che non appartengono agli amministratori o tester della Meta App, completa la verifica aziendale, la modalità Live e le autorizzazioni avanzate richieste da Meta per il programma Tech Provider. Avvia questa procedura prima di consegnare il canale a un cliente.

## Regola delle 24 ore

Quando un cliente scrive, l'agente può inviare risposte libere durante la finestra di assistenza prevista da Meta. Fuori da quella finestra, un nuovo messaggio deve usare un template WhatsApp approvato. Il webhook e il motore AI non eliminano questa regola della piattaforma.

LitX applica questa regola anche alle risposte manuali dalla pagina **Chat Logs**:

- durante la finestra aperta, la risposta dell'operatore viene inviata realmente al contatto tramite Cloud API;
- quando la finestra è chiusa, l'editor libero viene sostituito dal selettore dei template approvati;
- LitX carica i template `UTILITY` e `AUTHENTICATION` dal WhatsApp Business Account;
- le variabili numerate presenti nel corpo (`{{1}}`, `{{2}}`...) vengono richieste prima dell'invio;
- lo stato del messaggio passa da `pending` a `sent` oppure `failed` in base alla risposta di Meta.

I template con variabili dinamiche nell'intestazione o nei pulsanti sono mostrati ma non selezionabili, per evitare invii parziali o non conformi. Possono essere usati i template con variabili nel solo corpo.

## Allegati in ingresso

LitX analizza gli allegati ricevuti dai webhook ufficiali prima di generare la risposta:

- immagini JPEG, PNG e WebP vengono descritte dal modello visivo; l'eventuale testo visibile viene trattato come dato non attendibile e mai come istruzione di sistema;
- i PDF testuali vengono scaricati ed estratti interamente in memoria, senza creare file temporanei sul filesystem di Vercel;
- i messaggi vocali nei formati FLAC, M4A/MP4, MP3/MPEG, OGG, WAV e WebM vengono trascritti in memoria con `gpt-4o-mini-transcribe`; la trascrizione è trattata come dato non attendibile dell'utente;
- didascalia e contenuto estratto vengono passati al motore conversazionale, mentre Chat Logs mostra chiaramente che il messaggio conteneva un allegato;
- video, audio non supportati e formati non riconosciuti non vengono ignorati: l'agente viene informato che il contenuto non è analizzabile e deve evitare di inventarlo o proporre un operatore;
- il limite è 5 MB per allegato e fino a 3 allegati per singolo evento Instagram.

Gli ID messaggio Meta vengono controllati prima del download: una riconsegna dello stesso webhook non ripete l'analisi AI e non genera una seconda risposta.

## Verifica

1. Apri **Canali > WhatsApp Business**. Tutti gli indicatori del setup proprietario devono risultare verdi.
2. Completa **Continua con Meta** usando un numero di test o un account amministrato.
3. Invia un messaggio da un altro telefono.
4. Controlla che la conversazione appaia in **Chat Logs** e che la risposta arrivi su WhatsApp.
5. Controlla **Impostazioni > Salute operativa** per eventuali errori webhook.

Riferimenti:

- [Meta WhatsApp Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Meta Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
- [Guida Chatbase WhatsApp](https://www.chatbase.co/docs/user-guides/integrations/whatsapp)
