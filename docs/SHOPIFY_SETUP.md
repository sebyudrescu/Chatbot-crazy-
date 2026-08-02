# Shopify — configurazione proprietario

LitX usa il flusso ufficiale di autorizzazione per applicazioni standalone. Il proprietario configura
una sola Shopify App; ogni cliente collega poi il proprio negozio dal pannello LitX senza comunicare
password o access token.

## Configurazione una tantum

1. Crea una Shopify App dal Dev Dashboard.
2. Imposta come App URL il dominio pubblico di LitX.
3. Aggiungi tra gli Allowed redirection URL:
   `https://DOMINIO-LITX/api/shopify/oauth/callback`.
4. Abilita lo scope `read_products`.
5. Salva Client ID e Client Secret nelle variabili protette di Vercel:
   `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET`.
6. Verifica che `NEXT_PUBLIC_APP_URL` contenga il dominio HTTPS di LitX e ripubblica.

Il webhook usato da LitX è `https://DOMINIO-LITX/api/shopify/webhooks`. Le sottoscrizioni per
creazione, aggiornamento, eliminazione prodotti e disinstallazione vengono registrate automaticamente
dopo l'autorizzazione.

## Collegamento di un cliente

1. Apri **Integrazioni → Shopify** nell'agente del cliente.
2. Inserisci il dominio `nome-negozio.myshopify.com`.
3. Premi **Continua con Shopify**.
4. Il cliente accede a Shopify e autorizza LitX.

LitX conserva access token e refresh token cifrati. I token offline a scadenza vengono ruotati prima
delle chiamate in background. Dopo il collegamento viene eseguito il primo sync del catalogo.

## Conversioni verificate

Dal pannello **Commerce → Vendite verificate** genera una chiave per l'agente. Il server del negozio
può inviare checkout e ordini a `/api/commerce/conversions` con:

- `X-LitX-Key-Id`: ID della chiave;
- `X-LitX-Timestamp`: timestamp Unix in secondi;
- `X-LitX-Signature`: HMAC-SHA256 esadecimale di `timestamp + "." + rawJson`.

Il segreto non deve mai essere inserito nel browser. Gli eventi sono idempotenti tramite
`externalEventId` e non richiedono email, nome, indirizzo o altri dati personali.
