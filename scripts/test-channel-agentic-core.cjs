const Module = require("node:module");
const path = require("node:path");
const assert = require("node:assert/strict");

const createdMessages = [];
const commerceEvents = [];
let agentCalls = 0;
let legacyCalls = 0;
let orderFallbackCalls = 0;
let policyAction = "allow";
let agentThrows = false;
let invalidCards = false;
let lastAgentQuery = "";

const productCard = {
  productId: "11111111-1111-4111-8111-111111111111",
  variantId: "22222222-2222-4222-8222-222222222222",
  title: "Pantalone lino nero",
  shortDescription: "Catalogo verificato",
  imageUrl: "https://shop.example.com/pantalone.jpg",
  productUrl: "https://shop.example.com/products/pantalone-lino-nero",
  price: 79.9,
  currency: "EUR",
  availability: "in_stock",
  reason: "Rispetta colore e materiale richiesti",
  options: [],
  variants: [],
  actions: [{ type: "view", label: "Vedi prodotto", url: "https://shop.example.com/products/pantalone-lino-nero" }],
};

const prisma = {
  commerceEvent: { createMany: async ({ data }) => { commerceEvents.push(...data); } },
  message: {
    findUnique: async () => null,
    create: async ({ data }) => {
      const message = { id: `message-${createdMessages.length + 1}`, createdAt: new Date(), ...data };
      createdMessages.push(message);
      return message;
    },
  },
  conversation: {
    upsert: async ({ create }) => ({
      id: "conversation-1",
      botId: "bot-1",
      channel: create.channel,
      userSessionId: create.userSessionId,
      userIntent: null,
      sentiment: null,
      topicsDiscussed: "[]",
      needsHumanEscalation: false,
      isResolved: false,
      chatbot: { companyName: "Negozio Test", settings: "{}", systemPrompt: "", promptTemplateId: null, promptVariables: "{}" },
      messages: [],
    }),
    update: async ({ data }) => data,
  },
};

const emptyWorkflow = { executed: [], failed: [], skipped: [], actions: [] };
const emptyActions = { executed: [], failed: [], skipped: [], ctas: [], leadForms: [], channelMessages: [], handoffActivated: false, forceProductCards: false, orderLookupForm: false, productWidget: null };
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/db") return { prisma };
  if (request === "@/lib/crm-sync") return { syncCRMContactFromConversation: async () => ({ id: "contact-1" }) };
  if (request === "@/lib/agentic-orchestrator") return {
    orchestrateAgenticResponse: async (context) => {
      agentCalls += 1;
      lastAgentQuery = context.query;
      if (agentThrows) throw new Error("temporary model outage");
      return {
        response: "Ho trovato un prodotto verificato per cliente@example.com.",
        productCards: invalidCards ? [{ ...productCard, productUrl: "javascript:alert(1)" }] : [productCard],
        orderLookupForm: false,
        handoff: false,
        sources: [],
        toolTrace: [{ name: "search_products", durationMs: 12, success: true, resultCount: 1 }],
        model: "gpt-test",
        processingTimeMs: 20,
        responseType: "agentic_product_discovery",
        intent: "product_discovery",
        confidence: 1,
      };
    },
  };
  if (request === "@/lib/decision-orchestrator") return {
    orchestrateResponse: async () => {
      legacyCalls += 1;
      return {
        response: "Fallback legacy sicuro.",
        decision: { intent: { intent: "question", confidence: 0.8 }, topics: [] },
        metadata: { confidence: 0.8, responseType: "rag", grounding: { action: "allow", reason: "grounded", evidenceCount: 1, confidence: 0.8, threshold: 0.7 } },
        sourcesUsed: [],
      };
    },
  };
  if (request === "@/lib/agent-policy") return {
    evaluateIncomingPolicy: () => ({ action: policyAction, category: policyAction === "allow" ? undefined : "forbidden_topic", matchedRule: policyAction === "allow" ? undefined : "vietato" }),
    enforceOutgoingPolicy: () => ({ action: "allow" }),
    policyResponse: () => "Richiesta non consentita",
  };
  if (request === "@/lib/rate-limit") return { checkRateLimit: async () => ({ allowed: true, remaining: 29, resetAt: Date.now() + 60_000 }) };
  if (request === "@/lib/woocommerce-order-tracking") return {
    parseOrderLookupMessage: text => ({ hasIntent: /ordine/i.test(text), containsCredentials: /@/.test(text) }),
    redactOrderLookupMessage: text => text.replace(/\b\S+@\S+\b/g, "[email protetta]"),
  };
  if (request === "@/lib/order-tracking") return {
    tryVerifiedOrderLookup: async () => { orderFallbackCalls += 1; return { handled: false }; },
  };
  if (request === "@/lib/product-search") return {
    hasVerifiedProductSource: async () => false,
    searchVerifiedProducts: async () => ({ selections: [], promptContext: "", catalogSize: 0, query: { maxCards: 0, wantsCards: false } }),
  };
  if (request === "@/lib/commerce-catalog") return { hydrateProductCards: async () => [] };
  if (request === "@/lib/verified-product-response") return { buildVerifiedProductResponse: () => "" };
  if (request === "@/lib/integration-webhooks") return { emitIntegrationWebhook: async () => undefined };
  if (request === "@/lib/commerce-query") return {
    buildCatalogFollowUpQuery: () => null,
    buildConversationalCommerceQuery: query => query,
    classifyCommerceIntent: () => "none",
    isGenericStyleAdviceRequest: () => false,
    needsProductDiscoveryClarification: () => false,
    parseCommerceQuery: () => ({ maxCards: 0 }),
  };
  if (request === "@/lib/conversation-guidance") return {
    catalogUnavailableResponse: () => "Catalogo non disponibile",
    detectBusinessMode: () => "services",
    isVerifiedCatalogIntent: () => false,
    productDiscoveryClarification: () => "Che prodotto cerchi?",
    styleAdviceClarification: () => "Che stile preferisci?",
  };
  if (request === "@/lib/workflow-engine") return { runActiveWorkflows: async () => emptyWorkflow };
  if (request === "@/lib/action-engine") return { runTriggeredActions: async () => emptyActions };
  if (request.startsWith("@/")) return originalLoad.call(this, path.join(__dirname, "..", request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};

delete process.env.AGENTIC_CORE_ENABLED;
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
require("ts-node/register/transpile-only");
const { processIncomingChannelMessage } = require("../lib/channel-message-processor.ts");

;(async () => {
  const agentic = await processIncomingChannelMessage({
    botId: "bot-1",
    channel: "whatsapp",
    externalThreadId: "393331234567",
    externalMessageId: "wamid-agentic-1",
    text: "Stato ordine 123, cliente@example.com e poi mostrami pantaloni neri",
  });
  assert.equal(agentCalls, 1, "Il core agentico non e attivo per default");
  assert.equal(legacyCalls, 0, "Il router legacy e stato eseguito prima del modello agentico");
  assert.equal(orderFallbackCalls, 0, "Il tracking deterministico ha intercettato la richiesta prima dell'agente");
  assert.match(lastAgentQuery, /cliente@example\.com/, "Il tool agentico non riceve i dati necessari alla verifica ordine");
  assert.doesNotMatch(agentic.response, /cliente@example\.com/, "PII restituita nel testo del canale");
  assert.match(agentic.response, /\[email protetta\]/, "PII non oscurata nell'output");
  assert.equal(agentic.productCards.length, 1, "Card verificata rimossa dal percorso agentico");
  assert.equal(commerceEvents.length, 1, "Impression della card agentica non registrata");
  const storedUser = createdMessages.find(message => message.role === "user");
  assert.doesNotMatch(storedUser.content, /cliente@example\.com/, "PII ordine salvata nella cronologia");
  const storedAssistant = createdMessages.find(message => message.role === "assistant");
  assert.match(storedAssistant.sourcesUsed, /"architecture":"agentic"/, "Trace agentica non salvata");

  policyAction = "fallback";
  const blocked = await processIncomingChannelMessage({ botId: "bot-1", channel: "instagram", externalThreadId: "ig-1", externalMessageId: "ig-blocked-2", text: "contenuto vietato" });
  assert.equal(blocked.response, "Richiesta non consentita", "Policy in ingresso bypassata dall'agente");
  assert.equal(agentCalls, 1, "Richiesta bloccata inviata al modello");

  policyAction = "allow";
  invalidCards = true;
  const invalid = await processIncomingChannelMessage({ botId: "bot-1", channel: "instagram", externalThreadId: "ig-1", externalMessageId: "ig-invalid-card-3", text: "fammi vedere altro" });
  assert.equal(invalid.productCards.length, 0, "Card con URL non sicuro inviata al canale");

  invalidCards = false;
  agentThrows = true;
  const fallback = await processIncomingChannelMessage({ botId: "bot-1", channel: "whatsapp", externalThreadId: "393331234567", externalMessageId: "wamid-fallback-4", text: "chi siete?" });
  assert.equal(fallback.response, "Fallback legacy sicuro.", "Fallback legacy non usato dopo errore dell'agente");
  assert.equal(legacyCalls, 1, "Fallback legacy non eseguito una sola volta");
  assert.equal(orderFallbackCalls, 1, "Fallback ordine sicuro non verificato prima del percorso legacy");

  console.log(JSON.stringify({ success: true, checks: 17 }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
