process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
require("ts-node/register/transpile-only");

const assert = require("node:assert/strict");
const { configuredCtasOnly, safeCtaUrl } = require("../lib/cta-policy.ts");

assert.equal(safeCtaUrl("https://cliente.example/prenota"), "https://cliente.example/prenota");
assert.equal(safeCtaUrl("http://cliente.example"), null);
assert.equal(safeCtaUrl("javascript:alert(1)"), null);
assert.equal(safeCtaUrl("/pricing"), null);

const selected = configuredCtasOnly([
  { id: "valid", type: "link", label: "  Prenota ora  ", action: "https://cliente.example/prenota" },
  { id: "duplicate", type: "link", label: "Duplicata", action: "https://cliente.example/prenota" },
  { id: "invented", type: "link", label: "Prezzi", action: "/pricing" },
  { id: "unsafe", type: "link", label: "Apri", action: "javascript:alert(1)" },
]);

assert.deepEqual(selected.map((cta) => cta.id), ["valid"]);
assert.equal(selected[0].label, "Prenota ora");
console.log(JSON.stringify({ success: true, checks: 6 }, null, 2));
