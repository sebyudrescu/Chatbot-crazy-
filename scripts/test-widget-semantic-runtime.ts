import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultWidgetDefinition, WidgetDefinitionSchema } from "../lib/widget-definition";
import {
  prepareWidgetsForMessage,
  widgetsFromMessageMetadata,
} from "../lib/widget-message-persistence";

const actionId = "11111111-1111-4111-8111-111111111111";
const definition = defaultWidgetDefinition("custom", { name: "Scheda sicura" });
const persisted = prepareWidgetsForMessage([{
  id: "widget-1",
  actionId,
  definition,
  data: {
    title: "Dettaglio pubblico",
    customerEmail: "cliente@example.com",
    address: "Via Roma 10",
    generic: { value: "cliente@example.com", phoneValue: "+39 333 123 4567" },
    nested: { accessToken: "secret", availability: true },
  },
}]);

assert.equal(persisted.length, 1);
assert.equal(persisted[0].data.title, "Dettaglio pubblico");
assert.equal("customerEmail" in persisted[0].data, false);
assert.equal("address" in persisted[0].data, false);
assert.deepEqual(persisted[0].data.generic, { value: "[dato riservato]" });
assert.deepEqual(persisted[0].data.nested, { availability: true });
assert.deepEqual(widgetsFromMessageMetadata({ metadata: { declarativeWidgets: persisted } }), persisted);
assert.deepEqual(widgetsFromMessageMetadata({ metadata: { responseType: "legacy" } }), []);
assert.deepEqual(prepareWidgetsForMessage([{ id: "bad", actionId: "not-an-id" }]), []);

const serverDefinition = WidgetDefinitionSchema.parse({
  ...definition,
  root: { id: "root", type: "card", children: [{ id: "run", type: "button", text: "Continua", functionId: "lookup", children: [] }] },
  functions: [{
    id: "lookup", label: "Continua", type: "server_action", inputs: [], returns: [], waitForResponse: true,
    config: { url: "https://example.com/private", authorization: "Bearer secret-value", method: "GET" },
  }],
});
const redacted = prepareWidgetsForMessage([{ id: "widget-server", actionId, definition: serverDefinition, data: {} }]);
assert.equal(redacted.length, 1);
assert.equal(redacted[0].definition.functions[0].config.url, undefined);
assert.equal(redacted[0].definition.functions[0].config.authorization, undefined);

const oversized = prepareWidgetsForMessage(Array.from({ length: 5 }, (_, index) => ({
  id: `widget-${index}`,
  actionId,
  definition,
  data: { rows: Array.from({ length: 50 }, () => "x".repeat(5000)) },
})));
assert.ok(Buffer.byteLength(JSON.stringify(oversized), "utf8") <= 128_000);

const orchestrator = readFileSync("lib/agentic-orchestrator.ts", "utf8");
const actionEngine = readFileSync("lib/action-engine.ts", "utf8");
const historyRoute = readFileSync("app/api/embed/[botId]/conversations/[conversationId]/route.ts", "utf8");
const chatRoute = readFileSync("app/api/chat/route.ts", "utf8");
const testingPage = readFileSync("app/testing/page.tsx", "utf8");
assert.match(orchestrator, /name: "run_configured_action"/);
assert.match(orchestrator, /type: \{ in: \["show_widget", "booking_link", "collect_lead", "handoff", "api_widget"\] \}/);
assert.match(orchestrator, /String\(config\.method \|\| "POST"\)\.toUpperCase\(\) === "GET"/);
assert.match(orchestrator, /safeHttpsUrl\(config\.url\)/);
assert.match(actionEngine, /triggerMode === "semantic"/);
assert.match(actionEngine, /triggerMode: "keyword_fallback"|keyword_fallback/);
assert.match(actionEngine, /mayStoreContact/);
assert.match(actionEngine, /pendingLeadConsent/);
assert.match(historyRoute, /declarativeWidgets: widgetsFromMessageMetadata\(sourceData\)/);
assert.match(chatRoute, /declarativeWidgets: prepareWidgetsForMessage\(actionResult\.declarativeWidgets\)/);
assert.match(testingPage, /sessionEpochRef\.current \+= 1/);
assert.match(testingPage, /restoreControllerRef\.current\?\.abort\(\)/);
assert.match(testingPage, /sendControllerRef\.current\?\.abort\(\)/);
assert.match(testingPage, /sessionEpochRef\.current !== epoch/);
assert.match(testingPage, /litx-testing-conversation:\$\{selectedId\}/);

console.log("widget semantic routing and persistence contract: ok");
