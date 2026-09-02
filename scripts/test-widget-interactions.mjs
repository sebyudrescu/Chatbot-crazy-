import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const script = await fs.readFile(
  new URL("../public/chatbot-widget.js", import.meta.url),
  "utf8",
);
assert.match(script, /right: var\(--litx-mobile-edge, 16px\) !important/, "mobile launcher must use the measured storefront edge");
assert.match(script, /bottom: var\(--litx-mobile-bottom/, "mobile launcher must use the measured storefront bottom offset");
assert.match(script, /right: var\(--litx-desktop-edge, 88px\)/, "desktop launcher must use the measured storefront edge");
assert.match(script, /bottom: var\(--litx-desktop-bottom, 20px\)/, "desktop launcher must use the measured storefront bottom offset");
assert.match(script, /\.chatbot-launcher-logo[\s\S]*background-size: contain/, "the branded launcher logo must use an isolated background unaffected by merchant image CSS");
assert.match(script, /\.chatbot-launcher[\s\S]*padding: 0 !important/, "merchant button padding must not shrink the launcher logo viewport");
assert.match(script, /#carthike-chat-button-container/, "layout coordinator must recognize the merchant WhatsApp launcher");
assert.match(script, /window\.innerHeight - whatsapp\.rect\.bottom - gap - launcherHeight/, "layout coordinator must place LitX below the measured WhatsApp box");
assert.match(script, /Math\.max\(edge, window\.innerHeight - whatsapp\.rect\.bottom - gap - launcherHeight\)/, "WhatsApp stacking must not be overridden by the old mobile bottom floor");
assert.match(script, /positionedRect\.left \+ positionedRect\.width \/ 2/, "layout coordinator must correct the storefront fixed-position offset and center both launchers");
assert.doesNotMatch(script, /visualViewport\.addEventListener\('scroll'/, "mobile browser chrome scrolling must not move the launcher");
assert.match(script, /if \(layoutLocked\) return/, "storefront coordinates must remain locked after WhatsApp is measured");
assert.match(script, /const isMobile = mobileQuery\.matches/, "the storefront coordinator must align launchers on desktop and mobile");
assert.match(script, /sessionExpiresStorageKey/, "widget session must persist with an explicit expiry");
assert.match(script, /readSessionExpiry\(signedSessionToken\)/, "an active tab session must recover its expiry from the signed token");
assert.match(script, /window\.sessionStorage\.getItem\(key\)/, "widget conversations must be scoped to the current browser tab visit");
assert.doesNotMatch(script, /window\.localStorage\.(?:getItem|setItem)\(key/, "widget conversations must not survive a future visit through localStorage");
assert.match(script, /window\.addEventListener\('resize', unlockForViewportWidthChange/, "layout must respond only to real viewport width changes");
assert.match(script, /src\.includes\('\/api\/shopify\/widget\.js'\)/, "layout must survive Shopify script optimizers by reading its own URL");
const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  {
    url: "https://cliente.example/servizi",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  },
);
const { window } = dom;
const requests = [];
let staleConversationRejected = false;
let openedStoreUrl = "";

window.ChatbotConfig = {
  botId: "00000000-0000-4000-8000-000000000001",
  apiUrl: "https://litx.example",
  title: '<img src=x onerror="window.__xss=true"> Assistente',
  subtitle: "Risposte e prenotazioni",
  welcomeMessage: "Benvenuto nel nostro spazio. Come posso aiutarti?",
  primaryColor: "#633cff",
  secondaryColor: "#221166",
  launcherColor: "#ffffff",
  brandLogoUrl: "https://litx.example/assets/header-logo.png",
  iconType: "logo",
  iconValue: "https://litx.example/assets/client-logo.png",
  launcherMessageEnabled: true,
  launcherMessage: "Hai bisogno d'aiuto? Ti rispondiamo subito.",
  launcherMessageDelay: 0,
  launcherMessageDuration: 0,
};
window.open = (url) => {
  openedStoreUrl = String(url);
  return null;
};
window.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  requests.push({
    url: requestUrl,
    body: options.body ? JSON.parse(options.body) : null,
    headers: options.headers || {},
  });
  if (requestUrl.endsWith("/session")) {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          sessionId: "00000000-0000-4000-8000-000000000111",
          token: "signed-widget-session-token",
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (requestUrl.endsWith("/feedback")) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (requestUrl.endsWith("/lead")) {
    return new Response(
      JSON.stringify({
        success: true,
        data: { contactId: "00000000-0000-4000-8000-000000000004" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  if (requestUrl.includes("/widget-functions/")) {
    return new Response(JSON.stringify({ success: true, data: { quote: "ok" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (requestUrl === "https://cliente.example/cart/add.js") {
    return new Response(JSON.stringify({ id: 1001 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (requestUrl === "https://cliente.example/cart.js") {
    return new Response(
      JSON.stringify({ token: "cart-token", item_count: 1 }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (
    requests.at(-1)?.body?.message === "Ripristina sessione" &&
    requests.at(-1)?.body?.conversationId &&
    !staleConversationRejected
  ) {
    staleConversationRejected = true;
    return new Response(
      JSON.stringify({ success: false, error: "Conversation not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        conversationId: "00000000-0000-4000-8000-000000000002",
        assistantMessage: {
          id: "00000000-0000-4000-8000-000000000003",
          content: [
            "**Posso aiutarti** a prenotare.",
            "",
            "- Consulta [i servizi](https://cliente.example/servizi)",
            "- [Link non sicuro](javascript:alert(1))",
            "- <img src=x onerror=window.__messageXss=true>",
          ].join("\n"),
        },
        sources: [
          {
            id: "source-1",
            sourceType: "url",
            sourceUrl: "https://cliente.example/servizi",
          },
          {
            id: "source-2",
            sourceType: "pdf",
            originalFilename: "Listino servizi.pdf",
          },
          {
            id: "source-unsafe",
            sourceType: "url",
            sourceUrl: "javascript:alert(1)",
          },
        ],
        quickReplies: [
          { id: "reply-1", text: "Mostrami gli orari" },
          { id: "reply-2", text: "Parla con un operatore" },
        ],
        productWidget: {
          title: "Scelti per te",
          description: "Scegli la variante prima di continuare.",
          label: "Compra ora",
        },
        ctas: [
          {
            id: "cta-1",
            label: "Prenota ora",
            action: "https://calendar.example/prenota",
            variant: "primary",
          },
          {
            id: "cta-2",
            label: "Contatti",
            action: "/contatti",
            variant: "secondary",
          },
          {
            id: "cta-unsafe",
            label: "Non sicuro",
            action: "javascript:alert(1)",
          },
        ],
        productCards: [
          {
            productId: "00000000-0000-4000-8000-000000000020",
            title: "Prodotto verificato",
            shortDescription: "Descrizione del catalogo",
            imageUrl: "https://cliente.example/images/product.jpg",
            productUrl: "https://cliente.example/products/verified",
            price: 89.9,
            compareAtPrice: 109.9,
            currency: "EUR",
            availability: "in_stock",
            badge: "In offerta",
            reason: "Rientra nel budget indicato ed è disponibile.",
            variantId: "00000000-0000-4000-8000-000000000120",
            variants: [
              {
                variantId: "00000000-0000-4000-8000-000000000120",
                label: "M",
                choices: [{ name: "Taglia", value: "M" }],
                price: 89.9,
                currency: "EUR",
                availability: "in_stock",
                addToCartUrl:
                  "https://cliente.example/cart/add?id=1001&quantity=1",
              },
              {
                variantId: "00000000-0000-4000-8000-000000000121",
                label: "L",
                choices: [{ name: "Taglia", value: "L" }],
                price: 94.9,
                currency: "EUR",
                availability: "in_stock",
                addToCartUrl:
                  "https://cliente.example/cart/add?id=1002&quantity=1",
              },
            ],
            actions: [
              {
                type: "view",
                label: "Vedi prodotto",
                url: "https://cliente.example/products/verified",
              },
              {
                type: "add_to_cart",
                label: "Aggiungi al carrello",
                url: "https://cliente.example/cart/add?id=1001&quantity=1",
              },
            ],
          },
          {
            productId: "00000000-0000-4000-8000-000000000022",
            title: "Secondo prodotto verificato",
            shortDescription: "Seconda scheda da sfogliare",
            imageUrl: "https://cliente.example/images/product-2.jpg",
            productUrl: "https://cliente.example/products/verified-2",
            price: 74.5,
            currency: "EUR",
            availability: "preorder",
            reason: "Brand: Demo · Prezzo: 74.50 EUR · Disponibile",
            variants: [
              {
                variantId: "00000000-0000-4000-8000-000000000122",
                label: "Default Title",
                choices: [{ name: "Title", value: "Default Title" }],
                price: 74.5,
                currency: "EUR",
                availability: "preorder",
                addToCartUrl:
                  "https://negozio-esterno.example/cart/add?id=2001&quantity=1",
              },
            ],
          },
          {
            productId: "00000000-0000-4000-8000-000000000021",
            title: "Prodotto non sicuro",
            productUrl: "javascript:alert(1)",
            availability: "in_stock",
          },
        ],
        declarativeWidgets: [
          {
            id: "widget-safe-1",
            actionId: "00000000-0000-4000-8000-000000000070",
            definition: {
              version: 1,
              name: "Scelta assistita",
              description: "Widget dichiarativo sicuro",
              template: "custom",
              schema: [],
              defaults: {},
              states: [{ id: "ready", label: "Pronto", initial: true, visibleNodeIds: ["root", "title", "event", "server"] }],
              functions: [
                { id: "notify", label: "Seleziona", type: "client_event", inputs: [], returns: [], waitForResponse: false, config: { eventName: "litx:test" } },
                { id: "quote", label: "Richiedi", type: "server_action", inputs: [], returns: [], waitForResponse: true, config: {} },
              ],
              root: {
                id: "root",
                type: "card",
                children: [
                  { id: "title", type: "title", text: "Esperienza interattiva", children: [], props: {} },
                  { id: "event", type: "button", text: "Seleziona", functionId: "notify", children: [], props: {} },
                  { id: "server", type: "button", text: "Richiedi", functionId: "quote", children: [], props: {} },
                ],
                props: {},
              },
            },
            data: {},
          },
        ],
        actions: {
          leadForms: [
            {
              id: "lead-1",
              title: "Richiedi un contatto",
              description: "Lascia i dati e ti ricontatteremo.",
              fields: ["name", "email", "phone", "company"],
            },
          ],
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

window.eval(script);
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
await new Promise((resolve) => window.setTimeout(resolve, 5));

assert.ok(window.ChatbotWidget?.isLoaded(), "Il widget non si inizializza");
assert.equal(
  window.document.querySelector(".chatbot-launcher-logo")?.style.backgroundImage,
  'url("https://litx.example/assets/client-logo.png")',
  "Il logo personalizzato non viene renderizzato",
);
assert.equal(
  window.document.querySelector(".chatbot-brand-logo")?.getAttribute("src"),
  "https://litx.example/assets/header-logo.png",
  "Il logo del brand non viene mostrato nell'header",
);
assert.equal(
  window.document.querySelector(".chatbot-launcher-message")?.classList.contains("visible"),
  true,
  "La call to action iniziale non appare vicino al launcher",
);
assert.equal(
  window.document.querySelector(".chatbot-launcher-message")?.textContent,
  "Hai bisogno d'aiuto? Ti rispondiamo subito.×",
  "La call to action non usa il testo configurato",
);
assert.equal(
  window.document.querySelector(".chatbot-header img:not(.chatbot-brand-logo)"),
  null,
  "Il titolo del widget consente HTML non sicuro",
);
assert.match(
  window.document.querySelector(".chatbot-header h3")?.textContent || "",
  /Assistente/,
  "Il titolo testuale non viene mostrato",
);
assert.equal(
  window.document.querySelector(".chatbot-message.bot .chatbot-message-bubble")
    ?.textContent,
  "Benvenuto nel nostro spazio. Come posso aiutarti?",
  "Il welcome message personalizzato non viene mostrato",
);

await window.ChatbotWidget.sendMessage("Vorrei prenotare");

const richBubble = [
  ...window.document.querySelectorAll(
    ".chatbot-message.bot .chatbot-message-bubble",
  ),
].at(-1);
assert.equal(
  richBubble?.querySelector("strong")?.textContent,
  "Posso aiutarti",
  "Il grassetto Markdown non viene renderizzato",
);
assert.equal(
  richBubble?.querySelectorAll("ul li").length,
  3,
  "L'elenco Markdown non viene renderizzato",
);
assert.equal(
  richBubble?.querySelector('a[href="https://cliente.example/servizi"]')
    ?.textContent,
  "i servizi",
  "Il link HTTPS Markdown non viene renderizzato",
);
assert.equal(
  richBubble?.querySelector('a[href^="javascript:"]'),
  null,
  "Un link Markdown pericoloso è cliccabile",
);
assert.equal(
  richBubble?.querySelector("img"),
  null,
  "Il contenuto HTML di una risposta è stato eseguito",
);
assert.match(
  richBubble?.textContent || "",
  /<img src=x onerror=/,
  "L'HTML non attendibile non resta testo",
);
assert.equal(
  window.__messageXss,
  undefined,
  "Il contenuto della risposta ha eseguito JavaScript",
);

assert.equal(requests.length, 2, "Il widget esegue richieste API superflue");
assert.equal(
  requests[0].url,
  "https://litx.example/api/embed/00000000-0000-4000-8000-000000000001/session",
);
assert.equal(requests[1].url, "https://litx.example/api/chat");
assert.equal(requests[1].body.message, "Vorrei prenotare");
assert.equal(requests[1].body.source, "widget");
assert.equal(
  requests[1].body.pageContext.url,
  "https://cliente.example/servizi",
);
assert.equal(requests[1].body.pageContext.language, "en-US");
assert.equal(
  requests[1].body.userSessionId,
  "00000000-0000-4000-8000-000000000111",
  "Il widget non usa l'identità firmata dal server",
);
assert.equal(
  requests[1].headers["X-LitX-Widget-Session"],
  "signed-widget-session-token",
  "Il widget non invia la prova crittografica della sessione",
);
assert.equal(
  window.sessionStorage.getItem(
    "litx:00000000-0000-4000-8000-000000000001:conversation",
  ),
  "00000000-0000-4000-8000-000000000002",
  "La conversazione non viene conservata per i messaggi successivi",
);

const replies = window.document.querySelectorAll(".chatbot-quick-reply");
assert.equal(replies.length, 2, "Le domande rapide non vengono renderizzate");
const actions = window.document.querySelectorAll(".chatbot-action");
assert.equal(actions.length, 2, "Le CTA valide non vengono renderizzate");
assert.equal(
  actions[0].getAttribute("href"),
  "https://calendar.example/prenota",
  "La CTA assoluta non conserva la destinazione",
);
assert.equal(
  actions[1].getAttribute("href"),
  "https://cliente.example/contatti",
  "La CTA relativa non usa il sito del cliente",
);
assert.equal(
  window.document.querySelector('a[href^="javascript:"]'),
  null,
  "Il widget accetta protocolli CTA non sicuri",
);
assert.equal(actions[0].getAttribute("rel"), "noopener noreferrer");
assert.match(
  window.document.querySelector(".chatbot-declarative-widget")?.textContent || "",
  /Esperienza interattiva/,
  "Il renderer dichiarativo non mostra la struttura allowlisted",
);
assert.equal(
  window.document.querySelector(".chatbot-declarative-widget script"),
  null,
  "Il renderer dichiarativo non deve creare script",
);
const declarativeButtons = window.document.querySelectorAll("button.chatbot-declarative-button");
const serverButton = [...declarativeButtons].find((button) => button.textContent === "Richiedi");
assert.ok(serverButton, `Pulsante server action mancante: ${[...declarativeButtons].map((button) => button.textContent).join(", ")}`);
serverButton.click();
await new Promise((resolve) => window.setTimeout(resolve, 100));
const functionRequest = requests.find((request) => request.url.includes("/widget-functions/"));
assert.ok(functionRequest, `La server action pubblica non chiama l'endpoint embed: ${window.document.querySelector(".chatbot-declarative-error")?.textContent || "nessun errore"}`);
assert.equal(functionRequest.headers["X-LitX-Widget-Session"], "signed-widget-session-token", "La server action pubblica non invia la sessione firmata");
assert.equal(functionRequest.body.conversationId, "00000000-0000-4000-8000-000000000002", "La server action non resta vincolata alla conversazione");
const productCards = window.document.querySelectorAll(".chatbot-product-card");
assert.equal(
  productCards.length,
  2,
  "Le product card HTTPS non vengono renderizzate in sicurezza",
);
assert.equal(
  productCards[0]
    .querySelector(".chatbot-product-image-link")
    ?.getAttribute("href"),
  "https://cliente.example/products/verified",
  "La foto prodotto non punta alla pagina canonica",
);
assert.match(
  productCards[0].textContent || "",
  /89,90|€89\.90|89\.90/,
  "Il prezzo prodotto non viene mostrato",
);
assert.match(
  productCards[0].textContent || "",
  /Perché è adatto a te/,
  "La motivazione verificata del consiglio non viene mostrata",
);
const productCarousel = window.document.querySelector(
  ".chatbot-product-carousel-shell",
);
assert.equal(
  productCarousel?.getAttribute("aria-roledescription"),
  "carosello",
  "Il carosello prodotti non è annunciato correttamente",
);
assert.match(
  productCarousel?.textContent || "",
  /Scelti per te/,
  "Il titolo configurato del widget non viene mostrato",
);
assert.match(
  productCarousel?.textContent || "",
  /Scegli la variante prima di continuare/,
  "La descrizione configurata del widget non viene mostrata",
);
const carouselButtons =
  productCarousel?.querySelectorAll(".chatbot-product-nav") || [];
assert.equal(
  carouselButtons.length,
  2,
  "Le frecce del carosello prodotti non vengono mostrate",
);
assert.equal(
  carouselButtons[0].getAttribute("aria-label"),
  "Prodotto precedente",
);
assert.equal(
  carouselButtons[1].getAttribute("aria-label"),
  "Prodotto successivo",
);
assert.equal(
  carouselButtons[0].disabled,
  true,
  "La freccia precedente deve partire disabilitata",
);
carouselButtons[1].click();
assert.equal(
  carouselButtons[1].disabled,
  true,
  "La freccia successiva non aggiorna la pagina attiva",
);
assert.equal(
  productCarousel?.querySelector(".chatbot-product-counter")?.textContent,
  "2 / 2",
  "Il contatore del carosello non si aggiorna",
);
const externalCartButton = productCards[1].querySelector(
  ".chatbot-product-cart",
);
assert.equal(
  externalCartButton?.textContent,
  "Apri nel negozio",
  "Una superficie cross-origin promette un'aggiunta al carrello non verificabile",
);
assert.equal(
  productCards[1].querySelector(".chatbot-product-variant"),
  null,
  "La variante tecnica Shopify Default Title viene mostrata al cliente",
);
assert.equal(
  productCards[1].querySelector(".chatbot-product-reason"),
  null,
  "I soli metadati brand/prezzo/stock vengono presentati come motivazione personale",
);
const sources = window.document.querySelectorAll(".chatbot-source");
assert.equal(sources.length, 3, "Le fonti della risposta non vengono mostrate");
assert.equal(
  sources[0].getAttribute("href"),
  "https://cliente.example/servizi",
  "Il collegamento alla fonte non è corretto",
);
assert.match(
  sources[1].textContent || "",
  /Listino servizi\.pdf/,
  "La fonte documento non mostra il nome file",
);
assert.equal(
  sources[2].tagName,
  "DIV",
  "Una fonte con protocollo pericoloso è stata resa cliccabile",
);

const feedbackButtons = window.document.querySelectorAll(
  ".chatbot-feedback button",
);
assert.equal(
  feedbackButtons.length,
  2,
  "I controlli feedback non vengono mostrati",
);
feedbackButtons[0].click();
for (
  let attempt = 0;
  attempt < 40 &&
  window.document.querySelector(".chatbot-feedback span")?.textContent !==
    "Grazie!";
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
const feedbackRequest = requests.find((request) => request.url.endsWith("/feedback"));
assert.equal(
  feedbackRequest?.url,
  "https://litx.example/api/embed/00000000-0000-4000-8000-000000000001/feedback",
  "Il feedback usa un endpoint inatteso",
);
assert.deepEqual(feedbackRequest?.body, {
  messageId: "00000000-0000-4000-8000-000000000003",
  feedback: "positive",
  feedbackComment: null,
  userSessionId: "00000000-0000-4000-8000-000000000111",
});
assert.equal(feedbackButtons[0].getAttribute("aria-pressed"), "true");

replies[0].click();
for (
  let attempt = 0;
  attempt < 40 &&
  (!requests.some((request) => request.body?.message === "Mostrami gli orari") || window.document.getElementById("typing-indicator") !== null);
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
const quickReplyRequest = requests.find((request) => request.body?.message === "Mostrami gli orari");
assert.equal(
  quickReplyRequest?.body.message,
  "Mostrami gli orari",
  "Il click sulla domanda rapida non invia il testo",
);
assert.equal(
  quickReplyRequest?.body.conversationId,
  "00000000-0000-4000-8000-000000000002",
  "La domanda rapida non continua la conversazione esistente",
);
assert.equal(
  replies[0].disabled,
  true,
  "Le vecchie domande rapide restano attive",
);
assert.equal(
  window.document.getElementById("typing-indicator"),
  null,
  "L'indicatore di scrittura resta visibile dopo la risposta",
);

await window.ChatbotWidget.sendMessage("Ripristina sessione");
assert.equal(
  requests[5]?.body.conversationId,
  "00000000-0000-4000-8000-000000000002",
  "Il widget non prova a continuare la sessione salvata",
);
assert.equal(
  requests[6]?.body.conversationId,
  null,
  "Il widget non riparte quando la conversazione salvata è scaduta",
);
assert.equal(
  requests[6]?.body.userSessionId,
  requests[1]?.body.userSessionId,
  "Il recupero perde l'identità stabile del visitatore",
);

const leadForm = window.document.querySelector(".chatbot-lead-form");
assert.ok(leadForm, "Il modulo lead non viene mostrato");
leadForm.querySelector('input[name="name"]').value = "Mario Rossi";
leadForm.querySelector('input[name="email"]').value = "mario@example.com";
leadForm.querySelector('input[name="company"]').value = "Rossi SRL";
leadForm.querySelector('input[name="consent"]').checked = true;
leadForm.dispatchEvent(
  new window.Event("submit", { bubbles: true, cancelable: true }),
);
for (
  let attempt = 0;
  attempt < 40 && !window.document.querySelector(".chatbot-lead-success");
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(
  requests[7]?.url,
  "https://litx.example/api/embed/00000000-0000-4000-8000-000000000001/lead",
  "Il modulo lead usa un endpoint inatteso",
);
assert.deepEqual(requests[7]?.body, {
  conversationId: "00000000-0000-4000-8000-000000000002",
  userSessionId: "00000000-0000-4000-8000-000000000111",
  name: "Mario Rossi",
  email: "mario@example.com",
  phone: "",
  company: "Rossi SRL",
  consent: true,
});

const cartButton = productCards[0].querySelector(".chatbot-product-cart");
assert.ok(
  cartButton,
  "Il prodotto Shopify non mostra il pulsante Aggiungi al carrello",
);
assert.equal(
  cartButton.textContent,
  "Compra ora",
  "La label configurata del widget non viene applicata",
);
const variantSelect = productCards[0].querySelector(
  ".chatbot-product-variant select",
);
assert.ok(
  variantSelect,
  "La card non permette di scegliere una variante verificata",
);
assert.deepEqual(
  [...variantSelect.options].map((option) => option.textContent),
  ["M", "L"],
  "Le opzioni variante non corrispondono al catalogo",
);
variantSelect.value = "00000000-0000-4000-8000-000000000121";
variantSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
assert.match(
  productCards[0].querySelector(".chatbot-product-price")?.textContent || "",
  /94,90|94\.90/,
  "Il prezzo non segue la variante scelta",
);
let cartUpdate;
window.addEventListener(
  "litx:cart:updated",
  (event) => {
    cartUpdate = event.detail;
  },
  { once: true },
);
cartButton.click();
for (let attempt = 0; attempt < 40 && !cartUpdate; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(
  requests.some(
    (request) => request.url === "https://cliente.example/cart/add.js",
  ),
  true,
  "Il widget non usa l'API Ajax del carrello Shopify",
);
assert.equal(
  requests.some((request) => request.url === "https://cliente.example/cart.js"),
  true,
  "Il widget non aggiorna lo stato del carrello Shopify",
);
assert.equal(
  requests.find(
    (request) => request.url === "https://cliente.example/cart/add.js",
  )?.body?.items?.[0]?.id,
  1002,
  "Il carrello non usa esclusivamente la variante scelta",
);
assert.equal(
  cartUpdate?.itemCount,
  1,
  "L'evento del carrello non espone il conteggio aggiornato",
);
assert.equal(
  cartUpdate?.variantId,
  "00000000-0000-4000-8000-000000000121",
  "L'evento carrello non identifica la variante scelta",
);
externalCartButton.click();
assert.equal(
  openedStoreUrl,
  "https://negozio-esterno.example/cart/add?id=2001&quantity=1",
  "Il fallback cross-origin non apre il negozio verificato",
);
assert.doesNotMatch(
  externalCartButton.textContent || "",
  /Aggiunto/i,
  "Il fallback cross-origin dichiara un falso successo",
);

const restoredDom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  {
    url: "https://cliente.example/servizi",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  },
);
const restoredWindow = restoredDom.window;
restoredWindow.ChatbotConfig = {
  botId: "00000000-0000-4000-8000-000000000001",
  apiUrl: "https://litx.example",
  title: "Assistente",
  subtitle: "Cronologia",
};
restoredWindow.sessionStorage.setItem(
  "litx:00000000-0000-4000-8000-000000000001:conversation",
  "00000000-0000-4000-8000-000000000002",
);
restoredWindow.sessionStorage.setItem(
  "litx:00000000-0000-4000-8000-000000000001:session",
  "00000000-0000-4000-8000-000000000222",
);
restoredWindow.sessionStorage.setItem(
  "litx:00000000-0000-4000-8000-000000000001:session-token",
  "restored-signed-widget-token",
);
restoredWindow.sessionStorage.setItem(
  "litx:00000000-0000-4000-8000-000000000001:session-expires",
  String(Date.now() + 30 * 24 * 60 * 60 * 1000),
);
let historyRequest = "";
let includeOperatorReply = false;
restoredWindow.fetch = async (url) => {
  historyRequest = String(url);
  const historyMessages = [
    {
      id: "00000000-0000-4000-8000-000000000010",
      role: "user",
      content: "Quali servizi offrite?",
      sources: [],
      quickReplies: [],
      ctas: [],
    },
    {
      id: "00000000-0000-4000-8000-000000000011",
      role: "assistant",
      content: "Offriamo consulenza e assistenza.",
      feedback: null,
      sources: [
        {
          id: "source-restored",
          sourceType: "url",
          sourceUrl: "https://cliente.example/servizi",
        },
      ],
      quickReplies: [{ id: "restored-reply", text: "Voglio saperne di più" }],
      ctas: [],
    },
  ];
  if (includeOperatorReply) {
    historyMessages.push({
      id: "00000000-0000-4000-8000-000000000012",
      role: "assistant",
      content: "Ciao, sono Giulia. Come posso aiutarti?",
      feedback: null,
      sources: [],
      quickReplies: [],
      ctas: [],
    });
  }
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        conversationId: "00000000-0000-4000-8000-000000000002",
        needsHumanEscalation: includeOperatorReply,
        isResolved: false,
        assignedAgent: includeOperatorReply ? "Giulia" : null,
        messages: historyMessages,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
restoredWindow.eval(script);
restoredWindow.document.dispatchEvent(
  new restoredWindow.Event("DOMContentLoaded"),
);
for (
  let attempt = 0;
  attempt < 40 &&
  restoredWindow.document.querySelectorAll(".chatbot-message").length !== 2;
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.match(
  historyRequest,
  /sessionId=00000000-0000-4000-8000-000000000222/,
  "Il recupero storico non verifica l'identità della sessione",
);
assert.deepEqual(
  [...restoredWindow.document.querySelectorAll(".chatbot-message-bubble")].map(
    (element) => element.textContent,
  ),
  ["Quali servizi offrite?", "Offriamo consulenza e assistenza."],
  "La cronologia visibile non viene ripristinata correttamente",
);
assert.equal(
  restoredWindow.document.querySelectorAll(".chatbot-quick-reply").length,
  1,
  "Le interazioni dell'ultima risposta non vengono ripristinate",
);
assert.equal(
  restoredWindow.document.querySelectorAll(".chatbot-source").length,
  1,
  "Le fonti della cronologia non vengono ripristinate",
);
includeOperatorReply = true;
await restoredWindow.ChatbotWidget.refresh();
assert.deepEqual(
  [...restoredWindow.document.querySelectorAll(".chatbot-message-bubble")].map(
    (element) => element.textContent,
  ),
  [
    "Quali servizi offrite?",
    "Offriamo consulenza e assistenza.",
    "Ciao, sono Giulia. Come posso aiutarti?",
  ],
  "La risposta dell'operatore non arriva nel widget",
);
assert.match(
  restoredWindow.document.querySelector(".chatbot-handoff-status")
    ?.textContent || "",
  /Giulia/,
  "Lo stato di handoff non mostra l'operatore assegnato",
);
await restoredWindow.ChatbotWidget.refresh();
assert.equal(
  restoredWindow.document.querySelectorAll(".chatbot-message").length,
  3,
  "Il polling duplica messaggi già ricevuti",
);

const pageDom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  {
    url: "https://litx.example/agent/00000000-0000-4000-8000-000000000001",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  },
);
const pageWindow = pageDom.window;
pageWindow.ChatbotConfig = {
  botId: "00000000-0000-4000-8000-000000000001",
  apiUrl: "https://litx.example",
  title: "Assistente pubblico",
  subtitle: "Risposte verificate",
  displayMode: "page",
  autoOpen: true,
  showLauncher: false,
};
pageWindow.fetch = async () =>
  new Response(
    JSON.stringify({
      success: true,
      data: {
        sessionId: "00000000-0000-4000-8000-000000000333",
        token: "signed-public-page-token",
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
pageWindow.eval(script);
pageWindow.document.dispatchEvent(new pageWindow.Event("DOMContentLoaded"));
await new Promise((resolve) => pageWindow.setTimeout(resolve, 20));
assert.equal(
  pageWindow.document.querySelectorAll(".chatbot-launcher").length,
  0,
  "La pagina pubblica mostra ancora il launcher flottante",
);
assert.equal(
  pageWindow.document
    .querySelector(".chatbot-window")
    ?.classList.contains("open"),
  true,
  "La pagina pubblica non apre la chat a schermo intero",
);
assert.match(
  pageWindow.document.querySelector("style")?.textContent || "",
  /height:\s*100dvh/,
  "La modalità pagina non occupa il viewport",
);

const widgetStyles = window.document.querySelector("style")?.textContent || "";
assert.match(widgetStyles, /grid-auto-columns:\s*100%/, "Il carosello deve mostrare una card completa per pagina");
assert.match(widgetStyles, /right:\s*var\(--litx-mobile-edge, 16px\) !important/, "Il launcher mobile deve usare il bordo misurato");
assert.match(widgetStyles, /bottom:\s*var\(--litx-mobile-bottom/, "Il launcher mobile deve usare l'offset misurato da WhatsApp");
assert.match(widgetStyles, /\.chatbot-launcher\s*\{[^}]*width:\s*50px;[^}]*height:\s*50px;/s, "Il launcher mobile deve avere una dimensione compatta simile a WhatsApp");
assert.match(widgetStyles, /body\.litx-hide-back-to-top \.t4s-back-to-top/, "La freccia torna su deve essere nascosta tramite impostazione dell'app embed");
assert.doesNotMatch(widgetStyles, /body\.litx-chat-open #chwhatsapp-btn/, "Il widget non deve nascondere WhatsApp quando la chat e aperta");
assert.match(script, /Cosa non ti ha aiutato\?/u, "Il feedback negativo deve poter spiegare il problema alla Control Room");
window.ChatbotWidget.open();
assert.equal(window.document.body.classList.contains("litx-chat-open"), true, "L'apertura non coordina i controlli del negozio");
window.ChatbotWidget.close();
assert.equal(window.document.body.classList.contains("litx-chat-open"), false, "La chiusura non ripristina i controlli del negozio");
assert.equal(
  productCarousel?.closest(".chatbot-message-content")?.classList.contains("has-product-carousel"),
  true,
  "Le card prodotto non devono mantenere il limite stretto dei messaggi testuali",
);

const duplicateDom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { url: "https://cliente.example/", runScripts: "outside-only", pretendToBeVisual: true },
);
const duplicateWindow = duplicateDom.window;
duplicateWindow.ChatbotConfig = {
  botId: "00000000-0000-4000-8000-000000000099",
  apiUrl: "https://litx.example",
};
let duplicateChatRequests = 0;
let releaseDuplicateResponse;
const duplicateResponseGate = new Promise((resolve) => { releaseDuplicateResponse = resolve; });
duplicateWindow.fetch = async (url) => {
  if (String(url).endsWith("/session")) {
    return new Response(JSON.stringify({
      success: true,
      data: { sessionId: "00000000-0000-4000-8000-000000000199", token: "duplicate-test-token" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  duplicateChatRequests += 1;
  await duplicateResponseGate;
  return new Response(JSON.stringify({
    success: true,
    data: {
      conversationId: "00000000-0000-4000-8000-000000000299",
      userMessage: { id: "00000000-0000-4000-8000-000000000399" },
      assistantMessage: { id: "00000000-0000-4000-8000-000000000499", content: "Risposta singola" },
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};
duplicateWindow.eval(script);
duplicateWindow.document.dispatchEvent(new duplicateWindow.Event("DOMContentLoaded"));
duplicateWindow.eval(script);
assert.equal(
  duplicateWindow.document.querySelectorAll(".chatbot-widget-container").length,
  1,
  "Il caricamento ripetuto crea piu istanze del widget",
);
const firstDuplicateSend = duplicateWindow.ChatbotWidget.sendMessage("Una volta");
const secondDuplicateSend = duplicateWindow.ChatbotWidget.sendMessage("Una volta");
await new Promise((resolve) => duplicateWindow.setTimeout(resolve, 10));
assert.equal(duplicateChatRequests, 1, "Due invii concorrenti producono due richieste chat");
assert.equal(await secondDuplicateSend, false, "Il secondo invio non viene bloccato");
releaseDuplicateResponse();
assert.equal(await firstDuplicateSend, true, "L'invio valido non viene completato");

console.log(
  JSON.stringify(
    {
      success: true,
      checks: [
        "safe-header",
        "custom-logo",
        "single-chat-request",
        "quick-replies",
        "cta-links",
        "source-citations",
        "unsafe-protocol-rejection",
        "message-feedback",
        "tab-session-continuity",
        "stale-session-recovery",
        "lead-capture-form",
        "restored-history",
        "human-handoff-sync",
        "message-deduplication",
        "keyboard-accessible-controls",
        "page-context",
        "verified-product-cards",
        "accessible-product-carousel",
        "shopify-ajax-cart",
        "single-widget-instance",
        "concurrent-submit-lock",
        "mobile-control-spacing",
        "full-width-product-carousel",
        "standalone-public-page",
        "safe-declarative-widget",
        "signed-embed-widget-function",
      ],
    },
    null,
    2,
  ),
);

dom.window.close();
restoredDom.window.close();
pageDom.window.close();
duplicateDom.window.close();
