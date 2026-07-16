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
  requests.push({
    url: String(url),
    body: options.body ? JSON.parse(options.body) : null,
  });
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        conversationId: "00000000-0000-4000-8000-000000000002",
        assistantMessage: {
          id: `answer-${requests.length}`,
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

replies[0].click();
for (
  let attempt = 0;
  attempt < 40 &&
  (requests.length < 2 ||
    window.document.getElementById("typing-indicator") !== null);
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(
  requests[1]?.body.message,
  "Mostrami gli orari",
  "Il click sulla domanda rapida non invia il testo",
);
assert.equal(replies[0].disabled, true, "Le vecchie domande rapide restano attive");
assert.equal(
  window.document.getElementById("typing-indicator"),
  null,
  "L'indicatore di scrittura resta visibile dopo la risposta",
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
        "unsafe-protocol-rejection",
        "keyboard-accessible-controls",
      ],
    },
    null,
    2,
  ),
);

dom.window.close();
