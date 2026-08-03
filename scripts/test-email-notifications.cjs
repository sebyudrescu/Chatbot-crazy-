const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
process.env.RESEND_API_KEY = "re_test_secret";
process.env.RESEND_FROM_EMAIL = "LitX <notifications@example.com>";
process.env.NEXT_PUBLIC_APP_URL = "https://litx.example.com";
require("ts-node/register/transpile-only");

let request;
global.fetch = async (url, init) => {
  request = { url, init, body: JSON.parse(init.body) };
  return { ok: true, status: 200, json: async () => ({ id: "email_123" }) };
};

const { deliverEmailNotification } = require("../lib/email-notifications.ts");

;(async () => {
  const result = await deliverEmailNotification({
    to: "owner@example.com",
    event: "lead.captured",
    agentName: "Negozio <script>alert(1)</script>",
    payload: { conversationId: "11111111-1111-4111-8111-111111111111", email: "lead@example.com", reason: "<img src=x onerror=alert(1)>" },
    idempotencyKey: "lead:111",
  });
  assert.equal(result.success, true);
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.init.headers["Idempotency-Key"], "lead:111");
  assert.equal(request.body.to[0], "owner@example.com");
  assert.match(request.body.html, /&lt;script&gt;/);
  assert.doesNotMatch(request.body.html, /<script>/);
  assert.match(request.body.html, /conversations\?conversation=/);
  delete process.env.RESEND_API_KEY;
  const missing = await deliverEmailNotification({ to: "owner@example.com", event: "lead.captured", agentName: "Test", payload: {}, idempotencyKey: "lead:222" });
  assert.equal(missing.success, false);
  assert.match(missing.error, /RESEND_API_KEY/);
  console.log(JSON.stringify({ success: true, checks: 9 }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
