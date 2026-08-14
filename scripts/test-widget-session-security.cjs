const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "CommonJS",
  moduleResolution: "node",
});
require("ts-node/register/transpile-only");

process.env.WIDGET_SESSION_SECRET = randomBytes(32).toString("base64");
process.env.INTEGRATION_CONFIG_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const {
  createWidgetSession,
  readWidgetSession,
} = require("../lib/widget-session.ts");
const {
  decryptConfigSecrets,
  encryptConfigSecrets,
  redactSecrets,
  restoreMaskedSecrets,
} = require("../lib/secret-config.ts");

const botId = "00000000-0000-4000-8000-000000000001";
const created = createWidgetSession(botId, 1_000);
assert.equal(readWidgetSession(created.token, botId, created.sessionId, 2_000).botId, botId);
assert.throws(() => readWidgetSession(created.token, "00000000-0000-4000-8000-000000000002", created.sessionId, 2_000));
assert.throws(() => readWidgetSession(created.token, botId, "00000000-0000-4000-8000-000000000003", 2_000));
assert.throws(() => readWidgetSession(created.token, botId, created.sessionId, created.expiresAt + 1));
const last = created.token.at(-1);
const tampered = `${created.token.slice(0, -1)}${last === "x" ? "y" : "x"}`;
assert.throws(() => readWidgetSession(tampered, botId, created.sessionId, 2_000));

const plain = {
  endpoint: "https://example.com/hook",
  secret: "a-secret-value-with-entropy",
  nested: { authorization: "Bearer private-token", label: "CRM" },
};
const encrypted = encryptConfigSecrets(plain);
assert.notEqual(encrypted.secret, plain.secret);
assert.notEqual(encrypted.nested.authorization, plain.nested.authorization);
assert.deepEqual(decryptConfigSecrets(encrypted), plain);
const masked = redactSecrets(plain);
assert.equal(masked.secret, "********");
assert.deepEqual(
  restoreMaskedSecrets(masked, plain),
  plain,
  "Masked edits must preserve stored secrets",
);

const reordered = restoreMaskedSecrets(
  [
    { id: "second", authorization: "********" },
    { id: "first", authorization: "********" },
  ],
  [
    { id: "first", authorization: "Bearer first-secret" },
    { id: "second", authorization: "Bearer second-secret" },
  ],
);
assert.equal(reordered[0].authorization, "Bearer second-secret");
assert.equal(reordered[1].authorization, "Bearer first-secret");
assert.throws(
  () => restoreMaskedSecrets(
    [{ id: "different", authorization: "********" }],
    [{ id: "original", authorization: "Bearer original-secret" }],
  ),
  /non corrisponde piu alla stessa funzione/,
);

console.log(JSON.stringify({ success: true, checks: 13 }));
