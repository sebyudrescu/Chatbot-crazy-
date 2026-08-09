const Module = require("node:module");
const path = require("node:path");
const assert = require("node:assert/strict");

let orchestratorCalled = false;
let createdMessages = [];
let noticeChecks = 0;
const prisma = {
  message: {
    findUnique: async () => null,
    create: async ({ data }) => {
      const message = { id: `message-${createdMessages.length + 1}`, createdAt: new Date(), ...data };
      createdMessages.push(message);
      return message;
    },
  },
  conversation: {
    upsert: async () => ({
      id: "conversation-1",
      botId: "bot-1",
      userIntent: null,
      sentiment: null,
      topicsDiscussed: "[]",
      needsHumanEscalation: false,
      isResolved: false,
      messages: [],
      chatbot: { companyName: "Cliente Test", settings: "{}", systemPrompt: "", promptTemplateId: null, promptVariables: "{}" },
    }),
    update: async ({ data }) => data,
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/db") return { prisma };
  if (request === "@/lib/agentic-orchestrator") return { orchestrateAgenticResponse: async () => { throw new Error("Agentic core disabled in rate-limit test"); } };
  if (request === "@/lib/decision-orchestrator") return { orchestrateResponse: async () => { orchestratorCalled = true; throw new Error("L'orchestratore non deve partire sotto rate limit"); } };
  if (request === "@/lib/rate-limit") return {
    checkRateLimit: async (key) => {
      if (key.startsWith("channel-chat-notice:")) return { allowed: noticeChecks++ === 0, remaining: 0, resetAt: Date.now() + 300_000 };
      return { allowed: false, remaining: 0, resetAt: Date.now() + 300_000 };
    },
  };
  if (request.startsWith("@/")) return originalLoad.call(this, path.join(__dirname, "..", request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
process.env.AGENTIC_CORE_ENABLED = "false";
require("ts-node/register/transpile-only");

const { processIncomingChannelMessage } = require("../lib/channel-message-processor.ts");

;(async () => {
  const base = { botId: "bot-1", channel: "whatsapp", externalThreadId: "393331234567", text: "Messaggio ripetuto" };
  const first = await processIncomingChannelMessage({ ...base, externalMessageId: "wamid-1" });
  assert.equal(first.handoff, false, "Il primo superamento non restituisce l'avviso");
  assert.match(first.response, /molti messaggi/i, "Testo rate limit mancante");
  assert.equal(createdMessages.filter(message => message.role === "assistant").length, 1, "L'avviso non è stato salvato");

  const second = await processIncomingChannelMessage({ ...base, externalMessageId: "wamid-2" });
  assert.equal(second.handoff, true, "Gli avvisi successivi non vengono soppressi");
  assert.equal(createdMessages.filter(message => message.role === "assistant").length, 1, "Sono stati creati avvisi duplicati");
  assert.equal(orchestratorCalled, false, "Il rate limit ha comunque consumato una risposta AI");
  console.log(JSON.stringify({ success: true, checks: 5 }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
