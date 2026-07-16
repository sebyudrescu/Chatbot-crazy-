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
          content: "Posso aiutarti a prenotare.",
        },
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
        "unsafe-protocol-rejection",
        "message-feedback",
        "persistent-session",
        "stale-session-recovery",
        "lead-capture-form",
        "keyboard-accessible-controls",
      ],
    },
    null,
    2,
  ),
);

dom.window.close();
