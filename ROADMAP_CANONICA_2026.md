# LitX AI — Roadmap canonica di prodotto

Aggiornata il 2 agosto 2026. Questo è il documento di riferimento per i prossimi lavori.
Le roadmap precedenti restano come archivio storico, ma possono contenere attività già completate.

## Visione

LitX non deve essere un semplice chatbot che restituisce testo. Deve essere una piattaforma privata,
gestita da un unico proprietario, con cui creare agenti AI professionali per clienti diversi. Ogni
agente deve conoscere l'attività del cliente, mostrare contenuti ricchi, raccogliere lead, eseguire
azioni sicure e dimostrare il proprio valore con dati misurabili.

Il vantaggio competitivo non sarà “avere una chat”, ma offrire in un solo prodotto:

1. conoscenza verificata e aggiornata;
2. esperienza visiva personalizzata per ciascun cliente;
3. agenti specializzati per supporto, vendite, prenotazioni ed e-commerce;
4. CRM e handoff umano con tutto il contesto;
5. miglioramento continuo basato sulle conversazioni reali;
6. azioni esterne controllate, senza URL, prezzi o dati inventati dal modello.

## Stato verificato del progetto

### Milestone Commerce P0 completata nel codice (2 agosto 2026)

- Catalogo persistente con prodotti, varianti, fonti, job di sincronizzazione ed eventi commerce.
- Crawler interno e Firecrawl con estrazione JSON-LD `Product`/`Offer`, OpenGraph e URL canonici.
- Ricerca per titolo, SKU, brand, categoria, disponibilità e fascia di prezzo con regole merchandising.
- Product card reidratate dal server: il modello non controlla URL, immagini, prezzi o stock.
- Carousel responsive nel widget, contesto pagina, cronologia breve, foto cliccabili e add-to-cart verificato.
- Eventi impression, click e add-to-cart associati a conversazione, messaggio, sessione e prodotto.
- Pannello Commerce per catalogo, fonti, dati incompleti, priorità, promozioni, esclusioni e blocchi.
- Sincronizzazione iniziale Shopify Admin GraphQL e WooCommerce Store API.
- Build Next.js, TypeScript, lint, test widget desktop/mobile e contratti commerce superati.

### Milestone Commerce P0.1 completata nel codice (2 agosto 2026)

- OAuth Shopify ufficiale per applicazione standalone con state firmato, cookie anti-CSRF e verifica HMAC.
- Token offline cifrati, a scadenza e con rotazione automatica tramite refresh token.
- Registrazione idempotente dei webhook Shopify per create/update/delete prodotto e disinstallazione.
- Elaborazione webhook con firma sul raw body, deduplicazione durevole e retry sicuro.
- Chiavi commerce per agente e endpoint server-to-server firmato per checkout e conversioni verificate.
- Idempotenza degli ordini tramite ID evento esterno e attribuzione opzionale a conversazione/prodotto/variante.
- Pannello per generare o ruotare la chiave di conversione senza esporla nel widget.

Restano nel P0 operativo: configurazione delle credenziali della Shopify App su Vercel, collegamento di
un development store reale, onboarding e webhook incrementali WooCommerce, tracking ordine con verifica
identità e test database isolato nel CI.

### Già disponibile

- Creazione e clonazione di agenti con system prompt, ruolo, obiettivo, regole, tono e modello.
- Crawling di siti con limiti, deduplicazione, controllo qualità e protezioni URL.
- Knowledge base persistente con documenti, URL, PDF e altri formati testati.
- RAG, ricerca semantica, memoria conversazionale, intent, sentiment e confidence score.
- Citazioni delle fonti nelle risposte.
- Widget incorporabile con branding, quick replies, feedback e lead form.
- CTA configurate dal proprietario e con URL HTTPS validati.
- Workflow, azioni, webhooks, log di esecuzione e retry.
- Help desk, handoff umano, conversazioni, note e tag.
- CRM con pipeline, consenso, lead score, deduplicazione ed export CSV.
- Analytics, valutazioni AI, suggerimenti di miglioramento e monitor operativo.
- Export/import degli agenti, privacy export/delete e retention manuale.
- Deploy Vercel, database PostgreSQL, Pinecone e chiave OpenAI verificata.

### Stato parziale prima della milestone (archivio)

- Il crawler acquisisce bene il testo, ma non costruisce ancora un catalogo prodotti strutturato.
- Le CTA mostrano link sicuri, ma non esiste ancora un tipo di risposta “product card”.
- Il widget non invia ancora al bot la pagina che il visitatore sta guardando.
- Le analytics misurano chat e lead, ma non impression, click, add-to-cart e vendite attribuite.
- La personalizzazione del widget è buona, ma deve diventare un vero sistema white-label per cliente.
- Le valutazioni AI funzionano, ma alcuni agenti reali non sono valutabili finché la loro knowledge
  base non viene completata.

### Backlog originale

Le voci Commerce elencate qui sotto descrivono il punto di partenza; lo stato aggiornato è nella
sezione “Milestone Commerce P0” sopra. Le altre voci restano mancanti o rimandate.

- Catalogo prodotti normalizzato con immagini, varianti, prezzo, disponibilità e URL canonico.
- Card, carousel, confronto prodotti, link preview e media ricchi nel widget.
- Sincronizzazione nativa Shopify e WooCommerce.
- Ricerca prodotti con filtri strutturati, merchandising e alternative quando un articolo è esaurito.
- Azioni e-commerce: add-to-cart, visualizza carrello, tracking ordine e checkout.
- Vision nel widget per immagini inviate dall'utente.
- Booking completo con calendario, conferme e reminder.
- Email operative per lead, handoff ed errori critici.
- Report automatico sui knowledge gap e suggerimenti ordinati per impatto.
- Test A/B di prompt, CTA e comportamento del widget.
- Backup operativo completo e procedura documentata di disaster recovery.
- Penetration test, CSP più restrittiva e rotazione programmata dei segreti.
- Meta/WhatsApp/Instagram: volutamente rimandati.
- Password proprietario più robusta: rimandata per scelta del proprietario.

Sono fuori scope: multi-tenancy self-service, registrazione pubblica, piani SaaS e billing. LitX resta
un pannello privato usato per costruire e gestire chatbot per i propri clienti.

## Priorità P0 — Commerce Experience

Questa è la prossima iniziativa da completare prima delle altre funzioni avanzate.

### 1. Catalogo prodotti strutturato

Creare entità database dedicate:

- `Product`: agente, externalId, titolo, descrizione, brand, categorie, URL canonico, immagine
  principale, immagini aggiuntive, stato, data ultimo sync.
- `ProductVariant`: SKU, attributi, prezzo, prezzo precedente, valuta, disponibilità, stock e URL.
- `ProductSource`: origine `shopify`, `woocommerce`, `jsonld`, `merchant_feed`, `sitemap` o manuale.
- `ProductSyncJob`: stato, contatori, errori, retry e data del prossimo aggiornamento.
- `CommerceEvent`: impression, click, add-to-cart, checkout e conversione.

Regola fondamentale: immagini, URL, prezzi e disponibilità arrivano solo dal catalogo verificato.
Il modello può scegliere e spiegare i prodotti, ma non può inventarne i dati.

### 2. Product-aware crawler

Estendere il crawler con una pipeline separata dal contenuto editoriale:

1. scoprire sitemap e pagine prodotto;
2. leggere `schema.org/Product`, `Offer`, JSON-LD, Open Graph e canonical URL;
3. estrarre titolo, descrizione, immagini, SKU, brand, prezzo, valuta e disponibilità;
4. validare URL e immagini, deduplicare per canonical URL/SKU/externalId;
5. normalizzare i dati nel catalogo;
6. indicizzare una rappresentazione testuale del prodotto per la ricerca semantica;
7. conservare i campi commerciali nel database, non dentro testo libero;
8. segnalare prodotti incompleti, senza immagine o con prezzo non valido.

Ordine di affidabilità delle fonti:

1. API ufficiale Shopify/WooCommerce;
2. feed Google Merchant XML/CSV;
3. JSON-LD della pagina prodotto;
4. Open Graph e HTML;
5. testo estratto dal crawler.

### 3. Ricerca e raccomandazione prodotti

Introdurre intent specifici:

- ricerca esatta;
- raccomandazione per esigenza;
- confronto;
- fascia di prezzo;
- variante/taglia/colore;
- compatibilità;
- alternativa a prodotto esaurito;
- prodotto complementare e upsell;
- disponibilità e consegna.

La ricerca dovrà combinare:

- filtri deterministici su prezzo, stock, categoria, variante e brand;
- ricerca keyword per SKU e nomi esatti;
- ricerca semantica su descrizione, caratteristiche e casi d'uso;
- reranking per intento, disponibilità, pertinenza e regole commerciali.

Il motore deve chiedere una sola domanda di chiarimento quando mancano dati decisivi, per esempio
budget, taglia o utilizzo, e poi mostrare massimo 3–5 prodotti realmente pertinenti.

### 4. Contratto di risposta strutturato

Estendere la risposta chat con parti tipizzate, separate dal testo:

```text
productCards[] = {
  productId,
  variantId?,
  title,
  shortDescription,
  imageUrl,
  productUrl,
  price,
  compareAtPrice?,
  currency,
  availability,
  badge?,
  reason,
  actions[]
}
```

Le card devono essere costruite dal server a partire dagli ID recuperati. Il modello restituisce gli
ID e la motivazione; il server reidrata i dati dal database e rifiuta prodotti non trovati.

### 5. Widget commerce

Implementare:

- card interamente cliccabile con immagine, titolo, prezzo e disponibilità;
- carousel accessibile per più prodotti;
- immagine lazy-loaded con placeholder e fallback;
- badge “in offerta”, “disponibile”, “esaurito” e “nuovo”;
- pulsanti “Vedi prodotto”, “Confronta” e, quando supportato, “Aggiungi al carrello”;
- apertura del prodotto sul sito del cliente in una nuova scheda oppure nella scheda corrente,
  configurabile per agente;
- anteprima link per pagine non commerciali;
- rendering sicuro, senza HTML generato dal modello;
- layout desktop/mobile e supporto tastiera/screen reader.

Quando l'utente clicca la foto o la card deve andare all'URL canonico del prodotto. Gli eventi devono
essere tracciati per capire quante vendite o opportunità vengono generate dal chatbot.

### 6. Contesto della pagina visitata

Il widget deve inviare a ogni messaggio:

- URL e titolo della pagina corrente;
- referrer e lingua del browser;
- eventuale product ID/SKU esposto dal sito;
- UTM e campagna, se presenti;
- cronologia limitata delle pagine viste nella sessione.

Il server deve verificare che l'URL appartenga a un dominio autorizzato. Questo permette risposte come
“Sì, il prodotto che stai guardando è disponibile anche in blu” senza chiedere di quale prodotto si
tratta.

### 7. Shopify e WooCommerce

Prima versione:

- OAuth/installazione controllata dal proprietario;
- sync iniziale del catalogo;
- webhook per create/update/delete prodotto;
- mapping varianti, immagini, prezzi e stock;
- ricerca prodotti e link al prodotto;
- add-to-cart solo dal widget incorporato nello store;
- aggiornamento visivo del carrello tramite evento DOM;
- tracking ordine solo dopo verifica dell'identità del cliente.

Per siti senza piattaforma supportata resterà disponibile il catalogo da JSON-LD/feed/crawler.

### 8. Merchandising e controllo cliente

Per ogni agente aggiungere regole amministrabili:

- promuovi prodotti, collezioni, brand o tag;
- escludi dalle raccomandazioni;
- blocca completamente un prodotto;
- preferisci prodotti disponibili;
- margine minimo o priorità commerciale opzionale;
- limiti per upsell e sconti;
- campagne con data inizio/fine;
- testi aggiuntivi verificati per prodotto.

La promozione modifica il ranking ma non deve sostituire la pertinenza per l'utente.

## Priorità P1 — Esperienza e conversione

### Risposte ricche generali

- Link preview con titolo, dominio, immagine e descrizione verificati.
- Gallery immagini e video tutorial con allowlist dei domini.
- Allegati PDF/documenti direttamente nella risposta.
- Tabelle comparative responsive.
- Form dinamici per preventivo, booking, supporto e qualificazione lead.
- CTA condizionali per pagina, intento, agente e fase della conversazione.

### Proattività intelligente

- Trigger per tempo sulla pagina, scroll, exit intent, ricerca interna e carrello abbandonato.
- Messaggi diversi per home, prodotto, pricing, checkout e supporto.
- Limiti di frequenza per non disturbare il visitatore.
- Esperimenti controllati con gruppo di controllo.
- Proposte basate sul comportamento senza usare dati sensibili non autorizzati.

### Booking e lead

- Calendly/Google Calendar con disponibilità reale.
- Conferma e reminder email.
- Qualificazione conversazionale per obiettivo, budget, tempistiche e urgenza.
- Routing del lead nel CRM con score e riepilogo automatico.
- Follow-up suggerito o automatico solo se consenso e regole lo consentono.

### Personalizzazione premium

- Temi salvabili per cliente: colori, font, bordi, launcher, spaziatura e tono.
- Logo, avatar, nome agente, stato, messaggio iniziale e quick questions.
- White-label configurabile.
- Posizionamento desktop/mobile e modalità inline, popup o full page.
- CSS isolato per evitare conflitti con il sito ospitante.
- Preview responsive e test accessibilità prima della pubblicazione.

## Priorità P1 — Intelligenza e qualità

### Commerce reasoning

- Confronti basati solo su attributi presenti nel catalogo.
- Motivazione breve per ogni raccomandazione.
- Memoria delle preferenze nella sessione: budget, taglia, colore, uso e prodotti esclusi.
- Alternative automatiche quando un prodotto è esaurito.
- Nessuna raccomandazione di prodotto privo di immagine o non pubblicato.
- Regole verticali per moda, cosmetica, arredamento, servizi e ricambi.

### Continuous improvement flywheel

- Raggruppare domande non risolte per topic.
- Distinguere gap di contenuto, gap di dati e gap di azione.
- Mostrare conversazioni di esempio e impatto stimato.
- Generare una proposta di correzione, mai applicarla senza revisione del proprietario.
- Misurare il risultato dopo l'applicazione.
- Score automatici per groundedness, completezza, tono e outcome.

### Test e valutazioni

- Dataset per ciascun cliente e verticale.
- Test specifici per prodotto, prezzo, disponibilità, confronto e prompt injection.
- Golden answers e controlli deterministici sui campi strutturati.
- Test visivi del widget su mobile e desktop.
- Test di link rotti, immagini non raggiungibili e prodotti rimossi.
- Regression test prima di ogni deploy.
- A/B test di prompt, card, CTA e messaggi proattivi con significatività minima.

## Priorità P2 — Operazioni e integrazioni

### Analytics orientate al valore

- Funnel: apertura widget → domanda → card vista → click → add-to-cart → checkout → acquisto.
- Ricavi e lead attribuiti per agente, prodotto, pagina e campagna.
- Product CTR, add-to-cart rate, conversion rate e valore medio ordine.
- Resolution rate, handoff rate, tempo risposta e customer experience score.
- Topic explorer e knowledge gap ordinati per volume e impatto.
- Confronto tra periodi e report esportabile per il cliente.

### Integrazioni

- HubSpot/Pipedrive per contatti, attività e opportunità.
- Calendly/Google Calendar per booking.
- Resend o provider equivalente per email operative.
- Google Sheets per export/sync leggero.
- Zapier/Make tramite webhook e API actions.
- Meta/WhatsApp/Instagram solo quando verrà sbloccato il progetto Meta.

### Affidabilità

- Queue durevole per crawl, sync catalogo, embeddings ed email.
- Retry con backoff e dead-letter queue.
- Alert su crawler falliti, cataloghi vecchi, immagini rotte e webhook in errore.
- Backup database verificato e prova di ripristino.
- Export completo per agente e cliente.
- Budget e limiti di utilizzo AI per agente.
- Cache semantica con invalidazione quando knowledge/catalogo cambiano.

### Sicurezza e compliance

- CSP per widget e dashboard.
- Firma e scadenza delle azioni sensibili.
- Verifica identità per ordini, profilo e dati personali.
- Audit log delle azioni amministrative e commerciali.
- Rotazione dei segreti e password proprietario robusta quando approvata.
- Consent mode per analytics e proattività.
- Anonimizzazione configurabile e documentazione GDPR per cliente.
- Test SSRF, XSS, injection, URL malevoli e abuso degli endpoint commerce.

## Strategia per superare le piattaforme generaliste

### 1. Agency-first, non SaaS generico

Template verticali, clonazione agente, checklist di pubblicazione e report brandizzato permettono di
consegnare un chatbot completo a un cliente molto più velocemente.

### 2. Evidence-first commerce

Ogni card deve mostrare dati reali e aggiornati. Nel pannello devono essere visibili origine,
ultimo sync e motivo della raccomandazione. La fiducia vale più di una risposta molto creativa.

### 3. Un agente, più ruoli

Lo stesso agente riconosce se l'utente sta cercando supporto, un prodotto, una consulenza o un
appuntamento e applica il playbook corretto senza creare chatbot separati.

### 4. Outcome, non messaggi

La dashboard deve dimostrare appuntamenti, lead qualificati, click prodotto, carrelli e ricavi, non
soltanto il numero delle conversazioni.

### 5. Miglioramento approvato dall'umano

LitX suggerisce prompt, contenuti e azioni mancanti usando le conversazioni reali; il proprietario
approva. È più sicuro del “self-learning” incontrollato e più utile di una semplice lista di errori.

### 6. Personalizzazione profonda ma rapida

Preset di design per verticale più controlli avanzati. Un nuovo cliente deve arrivare a una preview
credibile in meno di un'ora, senza perdere la possibilità di personalizzazione su misura.

## Piano operativo di 30 giorni lavorativi

### Giorni 1–2 — Fondazioni commerce

- Definire schema database e contratto `productCards`.
- Scrivere migration, validazioni URL/immagini e test di sicurezza.
- Creare fixture reali per Shopify, WooCommerce e JSON-LD.

**Uscita:** catalogo normalizzato e contratto stabile, senza UI.

### Giorni 3–5 — Product crawler

- Estrarre JSON-LD, Open Graph, canonical, immagini, prezzi e stock.
- Scoprire product sitemap e feed.
- Deduplicare e mostrare qualità/errori di importazione.

**Uscita:** un URL e-commerce crea automaticamente un catalogo verificabile.

### Giorni 6–8 — Ricerca prodotti

- Intent commerce e filtri strutturati.
- Hybrid retrieval, reranking e chiarimenti.
- Regole anti-invenzione e reidratazione server-side.

**Uscita:** query prodotto restituiscono solo ID reali e pertinenti.

### Giorni 9–11 — Card e carousel

- Renderer widget desktop/mobile.
- Click su immagine/card, CTA, fallback immagine e accessibilità.
- Persistenza nella cronologia e test XSS/URL.

**Uscita:** esperienza visiva professionale completa.

### Giorni 12–13 — Page context

- Passare URL, titolo, lingua e product ID dal widget.
- Validare dominio e usare il prodotto corrente nella conversazione.
- Aggiungere test tra navigazioni SPA e pagine tradizionali.

**Uscita:** il chatbot capisce cosa sta guardando il visitatore.

### Giorni 14–17 — Shopify/WooCommerce

- Sync API e webhook.
- Varianti, disponibilità e aggiornamenti real-time.
- Add-to-cart sicuro e aggiornamento del carrello sul sito.

**Uscita:** primo agente e-commerce end-to-end.

### Giorni 18–19 — Merchandising

- Promuovi, escludi, blocca e campagne temporali.
- Informazioni custom verificate per prodotto.
- Alternative e prodotti complementari.

**Uscita:** il cliente controlla cosa può essere consigliato.

### Giorni 20–21 — Analytics commerce

- Eventi impression/click/cart/checkout.
- Funnel, CTR, conversione e attribuzione.
- Export/report cliente.

**Uscita:** valore economico misurabile.

### Giorni 22–23 — Rich media e link preview

- Preview link verificate, video, allegati e tabelle comparative.
- Policy domini e fallback accessibili.

**Uscita:** risposte ricche anche fuori dall'e-commerce.

### Giorni 24–25 — Booking ed email

- Calendario, conferme, reminder e notifiche lead/handoff.
- Log consegna e retry.

**Uscita:** flussi commerciali completati nella conversazione.

### Giorni 26–27 — Improvement engine

- Gap di contenuto/dati/azioni, impatto e proposta di correzione.
- Workflow di revisione e misurazione successiva.

**Uscita:** ciclo di miglioramento continuo controllato.

### Giorni 28–29 — Hardening

- Load test, cache, queue, backup/restore e security test.
- Test mobile, browser e accessibilità.

**Uscita:** release candidate stabile.

### Giorno 30 — Pilot cliente

- Configurare un cliente reale.
- Testare 50 domande, 10 ricerche prodotto e 5 azioni.
- Correggere i problemi bloccanti e misurare il funnel iniziale.

**Uscita:** prima release commerce pronta da mostrare e vendere.

## Criteri di completamento della prima release commerce

- Almeno il 95% dei prodotti importati con titolo, URL e immagine validi.
- Zero URL, immagini, prezzi o stock inventati nei test automatici.
- Risposta prodotto iniziale in meno di 4 secondi al percentile 95, esclusi cold start.
- Card usabili su mobile, tastiera e screen reader.
- Click e add-to-cart tracciati senza raccogliere dati personali non necessari.
- Aggiornamento prodotto riflesso nel chatbot entro 5 minuti con webhook e entro 24 ore con sync.
- Prodotti rimossi o non pubblicati mai raccomandati.
- Ogni deploy supera smoke test, crawler test, commerce regression e visual test.

## Backlog parcheggiato

- Meta/WhatsApp/Instagram e onboarding Meta.
- Voice bot e telefonia.
- Vision/upload immagini nel widget.
- Import Google Drive/Notion/Dropbox.
- Slack/Teams takeover.
- API pubblica e SDK.
- Browser extension e app mobile.
- Fine-tuning: valutare solo dopo aver raccolto abbastanza conversazioni di qualità; prima usare RAG,
  prompt versioning, evaluation e routing modelli.

## Prossima attività consigliata

Iniziare dai Giorni 1–2: schema catalogo, contratto di risposta strutturato, sicurezza e test. Solo
dopo avere una fonte di verità affidabile conviene costruire le card visive.
