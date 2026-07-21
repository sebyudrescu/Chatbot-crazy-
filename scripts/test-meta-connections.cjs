const Module = require("node:module");
const path = require("node:path");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");

let otherConnections = [];
let saved = null;
let unsubscribeRequest = null;
const prisma = {
  integrationConnection: {
    findMany: async () => otherConnections,
    upsert: async (input) => { saved = input; return input; },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/db") return { prisma };
  if (request.startsWith("@/")) return originalLoad.call(this, path.join(__dirname, "..", request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
process.env.META_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.META_GRAPH_API_VERSION = "v24.0";
require("ts-node/register/transpile-only");

const { metaTokenExpired, parseMetaConnection, saveMetaConnection } = require("../lib/meta-connections.ts");
const { unsubscribeMetaConnection } = require("../lib/meta-disconnect.ts");

;(async () => {
  assert.equal(metaTokenExpired({ tokenExpiresAt: new Date(2_000).toISOString() }, 1_999), false, "Token valido segnato come scaduto");
  assert.equal(metaTokenExpired({ tokenExpiresAt: new Date(2_000).toISOString() }, 2_000), true, "Token scaduto considerato valido");
  assert.equal(metaTokenExpired({}, 2_000), false, "Token senza scadenza considerato scaduto");

  const whatsapp = { botId: "bot-new", provider: "whatsapp", accessToken: "secret-token", details: { phoneNumberId: "222222", wabaId: "111111" } };
  await saveMetaConnection(whatsapp);
  assert(saved, "Connessione WhatsApp valida non salvata");
  const stored = parseMetaConnection(saved.create.config);
  assert.notEqual(stored.accessTokenEncrypted, "secret-token", "Token Meta salvato in chiaro");
  assert.equal(stored.phoneNumberId, "222222", "Numero WhatsApp perso durante il salvataggio");

  otherConnections = [{ config: JSON.stringify({ phoneNumberId: "222222", accessTokenEncrypted: "encrypted", connectedAt: new Date().toISOString() }) }];
  await assert.rejects(() => saveMetaConnection(whatsapp), /già collegato a un altro agente/, "Numero WhatsApp duplicato accettato");

  otherConnections = [{ config: JSON.stringify({ instagramAccountId: "333333", accessTokenEncrypted: "encrypted", connectedAt: new Date().toISOString() }) }];
  await assert.rejects(
    () => saveMetaConnection({ botId: "bot-new", provider: "instagram", accessToken: "secret-token", details: { instagramAccountId: "333333" } }),
    /già collegato a un altro agente/,
    "Account Instagram duplicato accettato",
  );

  const encryptedConfig = saved.create.config;
  global.fetch = async (url, options) => {
    unsubscribeRequest = { url: String(url), method: options.method, authorization: options.headers.Authorization };
    return { ok: true };
  };
  otherConnections = [];
  const unsubscribe = await unsubscribeMetaConnection({ id: "connection-1", provider: "whatsapp", config: encryptedConfig });
  assert.equal(unsubscribe.success, true, "Disiscrizione Meta valida fallita");
  assert.match(unsubscribeRequest.url, /\/111111\/subscribed_apps$/, "WABA errato durante la disiscrizione");
  assert.equal(unsubscribeRequest.method, "DELETE", "Disiscrizione Meta inviata con metodo errato");
  assert.equal(unsubscribeRequest.authorization, "Bearer secret-token", "Token Meta non decifrato per la disiscrizione");

  unsubscribeRequest = null;
  otherConnections = [{ config: JSON.stringify({ wabaId: "111111", phoneNumberId: "444444" }) }];
  const shared = await unsubscribeMetaConnection({ id: "connection-1", provider: "whatsapp", config: encryptedConfig });
  assert.equal(shared.attempted, false, "Sottoscrizione WABA condivisa rimossa");
  assert.equal(unsubscribeRequest, null, "Meta chiamata nonostante un altro numero dello stesso WABA");
  console.log(JSON.stringify({ success: true, checks: 14 }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
