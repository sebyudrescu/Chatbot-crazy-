import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ActionTypeSchema,
  WidgetTemplateSchema,
  validateActionDefinition,
} from "../lib/action-schema";
import {
  defaultWidgetDefinition,
  publicWidgetDefinition,
  validateWidgetData,
  validateWidgetInitialData,
  WidgetDefinitionSchema,
  widgetDefinitionDiff,
} from "../lib/widget-definition";
import { claimIdempotentExecution } from "../lib/idempotency-claim";
import { assertSafeHttpsRemoteUrl } from "../lib/url-safety";

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
  assert.equal(ActionTypeSchema.parse("api_widget"), "api_widget");
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

async function testDeclarativeWidgetSchema() {
  const definition = defaultWidgetDefinition("lead_capture", { title: "Parla con noi" });
  assert.equal(WidgetDefinitionSchema.parse(definition).root.type, "lead_form");
  assert.equal(WidgetTemplateSchema.parse("custom"), "custom");
  assert.deepEqual(widgetDefinitionDiff(definition, definition), ["Nessuna modifica funzionale"]);
  assert.equal(validateWidgetData(definition, {
    name: "Ada",
    email: "ada@example.com",
    consent: true,
  }).name, "Ada");
  assert.deepEqual(validateWidgetInitialData(definition, {}), {});
  assert.equal(WidgetDefinitionSchema.safeParse({
    ...definition,
    root: { id: "root", type: "html", children: [] },
  }).success, false, "arbitrary HTML must not be accepted");
  const serverDefinition = WidgetDefinitionSchema.parse({
    ...defaultWidgetDefinition("custom"),
    functions: [{
      id: "quote",
      label: "Preventivo",
      type: "server_action",
      inputs: [],
      returns: [],
      waitForResponse: true,
      config: { url: "https://api.example.com/quote", authorization: "Bearer secret", bodyTemplate: "{}" },
    }],
  });
  const publicDefinition = publicWidgetDefinition(serverDefinition);
  assert.equal(publicDefinition.functions[0].config.url, undefined);
  assert.equal(publicDefinition.functions[0].config.authorization, undefined);
  assert.equal(publicDefinition.functions[0].config.bodyTemplate, undefined);
  await assert.rejects(
    () => assertSafeHttpsRemoteUrl("http://example.com/private"),
    /richiedono un endpoint HTTPS/,
  );

  validateActionDefinition({
    type: "api_widget",
    config: {
      url: "https://api.example.com/products",
      method: "GET",
      definition: defaultWidgetDefinition("product_carousel"),
    },
  });
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

function testFunctionIdempotencyContract() {
  const runtime = fs.readFileSync(
    path.join(process.cwd(), "lib/widget-function-runtime.ts"),
    "utf8",
  );
  const embedRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/embed/[botId]/widget-functions/[actionId]/[functionId]/route.ts"),
    "utf8",
  );
  assert.match(runtime, /actionExecution\.create/);
  assert.match(runtime, /existing\.status === "pending"/);
  assert.match(runtime, /WidgetFunctionInProgressError/);
  assert.doesNotMatch(runtime, /existing \|\| \(await prisma\.actionExecution\.create/);
  assert.match(embedRoute, /X-LitX-Widget-Session|widgetSessionToken/);
  assert.match(embedRoute, /status = error instanceof WidgetFunctionInProgressError/);
}

function testWidgetStudioContracts() {
  const studio = fs.readFileSync(path.join(process.cwd(), "app/widgets/page.tsx"), "utf8");
  const generator = fs.readFileSync(path.join(process.cwd(), "app/api/widgets/generate/route.ts"), "utf8");
  const restoreRoute = fs.readFileSync(
    path.join(process.cwd(), "app/api/actions/[id]/widget-versions/[version]/restore/route.ts"),
    "utf8",
  );
  assert.match(studio, /"api_widget"/);
  assert.match(studio, /responsePath/);
  assert.match(studio, /Body template JSON/);
  assert.match(studio, /Input e binding/);
  assert.match(studio, /Return schema/);
  assert.match(studio, /Importa/);
  assert.match(studio, /Duplica/);
  assert.match(studio, /Chat bubble/);
  assert.match(studio, /Agent page/);
  assert.match(generator, /definition:\s*WidgetDefinitionSchema/);
  assert.doesNotMatch(generator, /defaultWidgetDefinition\(data\.template/);
  assert.match(generator, /non può creare server action/);
  assert.match(restoreRoute, /assertSafeHttpsRemoteUrl/);
  assert.doesNotMatch(restoreRoute, /await assertSafeRemoteUrl/);
  assert.match(restoreRoute, /title: typeof definition\.defaults\.title/);
  assert.match(restoreRoute, /description: typeof definition\.defaults\.body/);
  assert.match(studio, /title: typeof restored\.defaults\.title/);
  assert.match(studio, /updateDefinition\(restored\)/);
}

async function testConcurrentIdempotencyClaim() {
  type Record = { status: string; success: boolean; output: string | null; error: string | null };
  let stored: Record | null = null;
  let sideEffectClaims = 0;
  const create = async () => {
    if (stored) throw Object.assign(new Error("unique constraint"), { code: "P2002" });
    stored = { status: "pending", success: false, output: null, error: null };
    sideEffectClaims += 1;
    await Promise.resolve();
    return stored;
  };
  const find = async () => stored;
  const [first, second] = await Promise.all([
    claimIdempotentExecution(create, find),
    claimIdempotentExecution(create, find),
  ]);
  assert.equal(sideEffectClaims, 1, "only one concurrent request may claim the side effect");
  assert.equal([first, second].filter((item) => item.claimed).length, 1);
  assert.equal([first, second].filter((item) => !item.claimed).length, 1);

  await assert.rejects(
    () => claimIdempotentExecution(
      async () => { throw new Error("database unavailable"); },
      async () => stored,
    ),
    /database unavailable/,
    "non-unique database failures must never be mistaken for a claimed execution",
  );
}

async function main() {
  testActionSchema();
  await testDeclarativeWidgetSchema();
  testActionEngineContracts();
  testLeadWidgetSessionContract();
  testFunctionIdempotencyContract();
  testWidgetStudioContracts();
  await testConcurrentIdempotencyClaim();
  console.log("interactive widgets: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
