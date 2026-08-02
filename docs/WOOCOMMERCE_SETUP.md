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

Gli ordini vengono trasformati in eventi checkout/conversione senza memorizzare nome, email,
indirizzo o altri dati personali del compratore. `externalEventId` impedisce di contare due volte la
stessa consegna.

## Requisiti del negozio

- HTTPS pubblico valido;
- WooCommerce attivo e REST API disponibile;
- permessi di amministratore durante l'autorizzazione;
- WordPress deve poter eseguire richieste HTTPS in uscita verso il webhook LitX.

Il callback è `/api/woocommerce/oauth/callback`; il webhook è `/api/woocommerce/webhooks`.
