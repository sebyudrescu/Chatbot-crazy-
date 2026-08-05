# Avvisi email operativi

LitX può avvisare automaticamente il cliente quando viene acquisito un lead con consenso o quando
una conversazione richiede un operatore. L'invio usa Resend lato server; la chiave non viene mai
inserita nell'agente del cliente.

## Setup proprietario una tantum

1. Collega Resend dal Vercel Marketplace oppure crea una API key Resend.
2. Verifica il dominio mittente in Resend (SPF e DKIM).
3. Configura su Vercel `RESEND_API_KEY` e `RESEND_FROM_EMAIL`.
4. Configura `OPERATIONS_ALERT_EMAIL` con l'indirizzo del proprietario che deve ricevere gli errori server critici.
5. Ripubblica LitX.

## Setup per ogni cliente

1. Apri **Integrazioni → Avvisi email**.
2. Inserisci l'indirizzo operativo del cliente.
3. Lascia gli eventi predefiniti oppure indica, separati da virgola,
   `lead.captured` e `conversation.handoff_requested`.
4. Salva e usa **Testa**.

Ogni invio usa una chiave di idempotenza, quindi un retry dello stesso evento non produce email
doppie. Il corpo HTML viene escapato, contiene solo i campi operativi consentiti e collega alla
conversazione nella dashboard privata. Esiti e errori sono registrati senza salvare la API key.

Gli errori server non gestiti vengono prima salvati nell'event store e poi inviati fuori dal percorso
di risposta della richiesta. Errori con lo stesso fingerprint producono al massimo una email ogni
ora; se Resend non accetta l'invio, la prenotazione viene rimossa per consentire un retry successivo.
L'email contiene soltanto messaggio redatto, route, metodo, fingerprint e commit del deployment.

Per test iniziali Resend consente il mittente di onboarding con limiti; per consegnare il prodotto a
clienti reali è necessario un dominio verificato.
