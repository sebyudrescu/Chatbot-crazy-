import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ActionTypeSchema,
  WidgetTemplateSchema,
  validateActionDefinition,
} from "../lib/action-schema";

const templates = [
  "product_carousel",
  "lead_capture",
  "appointment",
  "order_tracking",
] as const;

function assertThrowsWithMessage(
  callback: () => void,
  expectedMessage: RegExp,
) {
  assert.throws(callback, expectedMessage);
}

function extractBranch(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Ramo non trovato: ${marker}`);
  const openingBrace = source.indexOf("{", markerIndex + marker.length);
  assert.notEqual(openingBrace, -1, `Blocco non trovato: ${marker}`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace, index + 1);
  }

  throw new Error(`Blocco non bilanciato: ${marker}`);
}

function testActionSchema() {
  assert.equal(ActionTypeSchema.parse("show_widget"), "show_widget");
  assert.equal(ActionTypeSchema.safeParse("run_script").success, false);

  for (const template of templates) {
    assert.equal(WidgetTemplateSchema.parse(template), template);
    validateActionDefinition({
      type: "show_widget",
      config:
        template === "appointment"
          ? { template, url: "https://booking.example.com/consulta" }
          : { template },
    });
  }

  assert.equal(WidgetTemplateSchema.safeParse("arbitrary_html").success, false);
  assertThrowsWithMessage(
    () =>
      validateActionDefinition({
        type: "show_widget",
        config: { template: "arbitrary_html" },
      }),
    /Template widget non supportato/,
  );
  assertThrowsWithMessage(
    () =>
      validateActionDefinition({
        type: "show_widget",
        config: { template: "appointment" },
      }),
    /richiede un URL HTTPS valido/,
  );
  assertThrowsWithMessage(
    () =>
      validateActionDefinition({
        type: "show_widget",
        config: { template: "appointment", url: "http://booking.example.com" },
      }),
    /richiede un URL HTTPS valido/,
  );
  assertThrowsWithMessage(
    () =>
      validateActionDefinition({
        type: "show_widget",
        config: { template: "appointment", url: "https://localhost/book" },
      }),
    /richiede un URL HTTPS valido/,
  );
}

function testActionEngineContracts() {
  const engineSource = fs.readFileSync(
    path.join(process.cwd(), "lib/action-engine.ts"),
    "utf8",
  );

  const productCarousel = extractBranch(
    engineSource,
    'if (template === "product_carousel")',
  );
  assert.match(productCarousel, /result\.forceProductCards\s*=\s*true/);
  assert.match(productCarousel, /result\.productWidget\s*=\s*\{/);
  assert.match(productCarousel, /Widget prodotti richiesto/);

  const leadCapture = extractBranch(
    engineSource,
    'if (template === "lead_capture")',
  );
  assert.match(leadCapture, /result\.leadForms\.push/);
  assert.match(leadCapture, /fields:\s*\["name",\s*"email",\s*"phone",\s*"company"\]/);
  assert.match(leadCapture, /result\.channelMessages\.push/);
  assert.match(leadCapture, /Se acconsenti/);

  const appointment = extractBranch(
    engineSource,
    'if (template === "appointment")',
  );
  assert.match(appointment, /safeHttpsUrl\(config\.url\)/);
  assert.match(appointment, /result\.ctas\.push/);
  assert.match(appointment, /variant:\s*"primary"/);
  assert.match(appointment, /metadata:\s*\{/);
  assert.match(appointment, /result\.channelMessages\.push/);

  const orderTracking = extractBranch(
    engineSource,
    'if (template === "order_tracking")',
  );
  assert.match(orderTracking, /result\.orderLookupForm\s*=\s*true/);
  assert.match(orderTracking, /result\.channelMessages\.push/);
  assert.match(orderTracking, /numero ordine/);
  assert.match(orderTracking, /email/);

  const widgetHandler = extractBranch(
    engineSource,
    'if (action.type === "show_widget")',
  );
  assert.match(widgetHandler, /Template widget non supportato/);
  assert.match(widgetHandler, /success\s*=\s*true/);
}

function testLeadWidgetSessionContract() {
  const leadFormSource = fs.readFileSync(
    path.join(process.cwd(), "components/chat/LeadCaptureForm.tsx"),
    "utf8",
  );
  assert.match(leadFormSource, /X-LitX-Widget-Session/);
  assert.match(leadFormSource, /nextSession\.sessionId !== userSessionId/);
  assert.doesNotMatch(leadFormSource, /Authorization:\s*`Bearer/);
  assert.match(leadFormSource, /consent:\s*true/);
}

testActionSchema();
testActionEngineContracts();
testLeadWidgetSessionContract();
console.log("interactive widgets: ok");
