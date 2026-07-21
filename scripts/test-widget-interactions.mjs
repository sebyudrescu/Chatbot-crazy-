import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const script = await fs.readFile(
  new URL("../public/chatbot-widget.js", import.meta.url),
  "utf8",
);
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "https://cliente.example/servizi",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
const requests = [];
let staleConversationRejected = false;

window.ChatbotConfig = {
  botId: "00000000-0000-4000-8000-000000000001",
  apiUrl: "https://litx.example",
  title: '<img src=x onerror="window.__xss=true"> Assistente',
  subtitle: "Risposte e prenotazioni",
  primaryColor: "#633cff",
  iconType: "logo",
  iconValue: "https://litx.example/assets/client-logo.png",
};
window.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  requests.push({
    url: requestUrl,
    body: options.body ? JSON.parse(options.body) : null,
  });
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

assert.ok(window.ChatbotWidget?.isLoaded(), "Il widget non si inizializza");
assert.equal(
  window.document.querySelector(".chatbot-launcher img")?.getAttribute("src"),
  "https://litx.example/assets/client-logo.png",
  "Il logo personalizzato non viene renderizzato",
);
assert.equal(
  window.document.querySelector(".chatbot-header img"),
  null,
  "Il titolo del widget consente HTML non sicuro",
);
assert.match(
  window.document.querySelector(".chatbot-header h3")?.textContent || "",
  /Assistente/,
  "Il titolo testuale non viene mostrato",
);

await window.ChatbotWidget.sendMessage("Vorrei prenotare");

const richBubble = [...window.document.querySelectorAll(".chatbot-message.bot .chatbot-message-bubble")].at(-1);
assert.equal(richBubble?.querySelector("strong")?.textContent, "Posso aiutarti", "Il grassetto Markdown non viene renderizzato");
assert.equal(richBubble?.querySelectorAll("ul li").length, 3, "L'elenco Markdown non viene renderizzato");
assert.equal(richBubble?.querySelector('a[href="https://cliente.example/servizi"]')?.textContent, "i servizi", "Il link HTTPS Markdown non viene renderizzato");
assert.equal(richBubble?.querySelector('a[href^="javascript:"]'), null, "Un link Markdown pericoloso è cliccabile");
assert.equal(richBubble?.querySelector("img"), null, "Il contenuto HTML di una risposta è stato eseguito");
assert.match(richBubble?.textContent || "", /<img src=x onerror=/, "L'HTML non attendibile non resta testo");
assert.equal(window.__messageXss, undefined, "Il contenuto della risposta ha eseguito JavaScript");

assert.equal(requests.length, 1, "Il widget esegue richieste API superflue");
assert.equal(requests[0].url, "https://litx.example/api/chat");
assert.equal(requests[0].body.message, "Vorrei prenotare");
assert.equal(requests[0].body.source, "widget");
assert.match(
  requests[0].body.userSessionId,
  /^widget_/,
  "Il widget non crea un'identità di sessione stabile",
);
assert.equal(
  window.localStorage.getItem(
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
assert.equal(feedbackButtons.length, 2, "I controlli feedback non vengono mostrati");
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
assert.equal(
  requests[1]?.url,
  "https://litx.example/api/embed/00000000-0000-4000-8000-000000000001/feedback",
  "Il feedback usa un endpoint inatteso",
);
assert.deepEqual(requests[1]?.body, {
  messageId: "00000000-0000-4000-8000-000000000003",
  feedback: "positive",
});
assert.equal(feedbackButtons[0].getAttribute("aria-pressed"), "true");

replies[0].click();
for (
  let attempt = 0;
  attempt < 40 &&
  (requests.length < 3 ||
    window.document.getElementById("typing-indicator") !== null);
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(
  requests[2]?.body.message,
  "Mostrami gli orari",
  "Il click sulla domanda rapida non invia il testo",
);
assert.equal(
  requests[2]?.body.conversationId,
  "00000000-0000-4000-8000-000000000002",
  "La domanda rapida non continua la conversazione esistente",
);
assert.equal(replies[0].disabled, true, "Le vecchie domande rapide restano attive");
assert.equal(
  window.document.getElementById("typing-indicator"),
  null,
  "L'indicatore di scrittura resta visibile dopo la risposta",
);

await window.ChatbotWidget.sendMessage("Ripristina sessione");
assert.equal(
  requests[3]?.body.conversationId,
  "00000000-0000-4000-8000-000000000002",
  "Il widget non prova a continuare la sessione salvata",
);
assert.equal(
  requests[4]?.body.conversationId,
  null,
  "Il widget non riparte quando la conversazione salvata è scaduta",
);
assert.equal(
  requests[4]?.body.userSessionId,
  requests[0]?.body.userSessionId,
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
  attempt < 40 &&
  !window.document.querySelector(".chatbot-lead-success");
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(
  requests[5]?.url,
  "https://litx.example/api/embed/00000000-0000-4000-8000-000000000001/lead",
  "Il modulo lead usa un endpoint inatteso",
);
assert.deepEqual(requests[5]?.body, {
  conversationId: "00000000-0000-4000-8000-000000000002",
  name: "Mario Rossi",
  email: "mario@example.com",
  phone: "",
  company: "Rossi SRL",
  consent: true,
});

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
restoredWindow.localStorage.setItem(
  "litx:00000000-0000-4000-8000-000000000001:conversation",
  "00000000-0000-4000-8000-000000000002",
);
restoredWindow.localStorage.setItem(
  "litx:00000000-0000-4000-8000-000000000001:session",
  "widget_persistent_visitor",
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
  /sessionId=widget_persistent_visitor/,
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
        "persistent-session",
        "stale-session-recovery",
        "lead-capture-form",
        "restored-history",
        "human-handoff-sync",
        "message-deduplication",
        "keyboard-accessible-controls",
      ],
    },
    null,
    2,
  ),
);

dom.window.close();
restoredDom.window.close();
