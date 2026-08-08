# WooCommerce — collegamento cliente

LitX usa l'Application Authentication Endpoint incluso in WooCommerce. Non serve creare una app
centrale né chiedere al cliente di copiare Consumer Key e Consumer Secret.

## Collegamento

1. Apri **Integrazioni → WooCommerce** nell'agente del cliente.
2. Inserisci l'URL HTTPS del negozio.
3. Premi **Continua con WooCommerce**.
4. Il cliente accede a WordPress e approva LitX.

WooCommerce invia le chiavi direttamente al callback HTTPS di LitX. Le chiavi vengono cifrate prima
di essere salvate e non vengono restituite all'interfaccia. LitX registra automaticamente webhook per:

- prodotto creato, aggiornato o eliminato;
- ordine creato o aggiornato.

Il primo catalogo viene importato in background tramite la REST API autenticata `wc/v3`. La
sincronizzazione percorre tutte le pagine di prodotti e tutte le pagine delle varianti, conserva un
checkpoint dopo ogni tranche riuscita e continua anche se il browser viene chiuso. Un prodotto
assente viene ritirato automaticamente solo dopo due snapshot completi consecutivi; i webhook di
eliminazione restano invece immediati.

Gli ordini vengono trasformati in eventi checkout/conversione senza memorizzare nome, email,
indirizzo o altri dati personali del compratore. `externalEventId` impedisce di contare due volte la
stessa consegna.

## Requisiti del negozio

- HTTPS pubblico valido;
- WooCommerce attivo e REST API disponibile;
- permessi di amministratore durante l'autorizzazione;
- WordPress deve poter eseguire richieste HTTPS in uscita verso il webhook LitX.

Il callback è `/api/woocommerce/oauth/callback`; il webhook è `/api/woocommerce/webhooks`.

## Tracking ordine sicuro

Nel widget, su WhatsApp e su Instagram il cliente può chiedere lo stato del proprio ordine. LitX:

1. richiede numero ordine ed email nello stesso messaggio;
2. rimuove automaticamente entrambi dal testo salvato nella conversazione;
3. interroga WooCommerce sul server e confronta l'email senza esporla;
4. restituisce solo stato, totale, metodo di spedizione, corriere e tracking disponibili;
5. usa una risposta indistinguibile se numero o email non corrispondono;
6. limita i tentativi per conversazione e per coppia ordine/email.

Se WooCommerce non è collegato, la conversazione viene inoltrata realmente all'help desk. Nome,
email, indirizzo e telefono presenti nell'ordine non vengono aggiunti alla memoria del chatbot.
