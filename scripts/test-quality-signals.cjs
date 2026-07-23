const assert = require("node:assert/strict");
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "CommonJS",
  moduleResolution: "node",
});
require("ts-node/register/transpile-only");

const { detectSentiment } = require("../lib/sentiment.ts");
const { evaluateResponse } = require("../lib/evaluation.ts");
const { validateActionDefinition } = require("../lib/action-schema.ts");

assert.equal(detectSentiment("Grazie, perfetto! Funziona benissimo 😊"), "positive");
assert.equal(detectSentiment("Non funziona, è un problema urgente 😡"), "negative");
assert.equal(detectSentiment("Vorrei conoscere gli orari"), "neutral");

const good = evaluateResponse(
  "Il servizio è disponibile dal lunedì al venerdì.",
  0.9,
  { expectedKeywords: ["lunedì"], forbiddenKeywords: ["inventato"], minimumConfidence: 0.7 },
);
assert.equal(good.passed, true);
assert.ok(good.score >= 0.75);
const unsafe = evaluateResponse(
  "Questo dato è inventato.",
  0.9,
  { expectedKeywords: [], forbiddenKeywords: ["inventato"], minimumConfidence: 0.7 },
);
assert.equal(unsafe.passed, false);
assert.equal(unsafe.dimensions.policySafe, false);

validateActionDefinition({
  type: "api_request",
  config: {
    url: "https://crm.example.com/leads",
    method: "POST",
    bodyTemplate: '{"message":"{{message}}"}',
  },
});
assert.throws(() => validateActionDefinition({
  type: "api_request",
  config: { url: "https://crm.example.com/leads", method: "DELETE" },
}));
assert.throws(() => validateActionDefinition({
  type: "api_request",
  config: { url: "https://crm.example.com/leads", bodyTemplate: "{not-json}" },
}));

console.log(JSON.stringify({ success: true, checks: 11 }));
