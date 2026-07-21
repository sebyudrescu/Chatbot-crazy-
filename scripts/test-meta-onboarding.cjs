const Module = require("node:module");
const path = require("node:path");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");

let savedConnection = null;
let requestedPhoneId = "222222";
let existingConnection = null;
const requests = [];
const prisma = {
  chatbot: { findUnique: async () => ({ id: "bot-1" }) },
  integrationConnection: { findUnique: async () => existingConnection },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/db") return { prisma };
  if (request === "@/lib/meta-connections") {
    return { saveMetaConnection: async (input) => { savedConnection = input; return input; } };
  }
  if (request === "@/lib/meta-client-link-usage") return { assertMetaClientLinkUnused: async () => undefined };
  if (request.startsWith("@/")) return originalLoad.call(this, path.join(__dirname, "..", request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
process.env.NEXT_PUBLIC_APP_URL = "https://agents.example.com";
process.env.META_GRAPH_API_VERSION = "v24.0";
process.env.META_VERIFY_TOKEN = "verify-token-that-is-at-least-32-characters";
process.env.META_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.META_APP_ID = "123456789012345";
process.env.META_APP_SECRET = "meta-app-secret-that-is-long-enough";
process.env.META_WHATSAPP_CONFIG_ID = "987654321098765";
require("ts-node/register/transpile-only");

global.fetch = async (input, options = {}) => {
  const url = String(input);
  requests.push({ url, method: options.method || "GET" });
  if (url.includes("/oauth/access_token")) return jsonResponse({ access_token: "temporary-access-token", expires_in: 3600 });
  if (url.includes("/111111/phone_numbers")) {
    return jsonResponse({ data: [{ id: requestedPhoneId, display_phone_number: "+39 333 123 4567" }] });
  }
  if (url.includes("/111111/subscribed_apps")) return jsonResponse({ success: true });
  throw new Error(`Richiesta inattesa: ${url}`);
};

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const { completeWhatsAppConnection } = require("../lib/meta-whatsapp-onboarding.ts");
const { assertMetaClientLinkUnused } = require("../lib/meta-client-link-usage.ts");

;(async () => {
  const base = { botId: "bot-1", code: "embedded-signup-code", wabaId: "111111", phoneNumberId: "222222" };
  const result = await completeWhatsAppConnection(base);
  assert.equal(result.displayPhoneNumber, "+39 333 123 4567", "Numero verificato non restituito");
  assert.equal(savedConnection.details.phoneNumberId, "222222", "Numero errato salvato");
  assert.equal(savedConnection.details.displayPhoneNumber, "+39 333 123 4567", "Numero leggibile non salvato");
  assert(requests.some((item) => item.url.includes("/111111/phone_numbers")), "Proprietà del numero non verificata");
  assert(requests.some((item) => item.url.includes("/111111/subscribed_apps") && item.method === "POST"), "Webhook WABA non sottoscritto");

  requestedPhoneId = "999999";
  savedConnection = null;
  requests.length = 0;
  await assert.rejects(
    () => completeWhatsAppConnection(base),
    /non appartiene al WhatsApp Business Account/,
    "Numero estraneo al WABA accettato",
  );
  assert.equal(savedConnection, null, "Connessione non valida salvata");
  assert(!requests.some((item) => item.url.includes("/subscribed_apps")), "Webhook sottoscritto prima di validare il numero");

  const link = { version: 2, botId: "bot-1", provider: "whatsapp", issuedAt: 2_000, expiresAt: 32_000 };
  existingConnection = { config: JSON.stringify({ connectedAt: new Date(1_000).toISOString() }) };
  await assertMetaClientLinkUnused(link);
  existingConnection = { config: JSON.stringify({ connectedAt: new Date(3_000).toISOString() }) };
  await assert.rejects(() => assertMetaClientLinkUnused(link), /già stato utilizzato/, "Link già consumato accettato");
  console.log(JSON.stringify({ success: true, checks: 10 }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
