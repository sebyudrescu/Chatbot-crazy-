import { z } from "zod";

const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type WidgetJson = z.infer<typeof JsonPrimitiveSchema> | WidgetJson[] | { [key: string]: WidgetJson };

export const WidgetFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "url",
  "email",
  "product_list",
  "order_status",
]);

export const WidgetSchemaFieldSchema = z.object({
  name: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  type: WidgetFieldTypeSchema,
  label: z.string().trim().min(1).max(120),
  required: z.boolean().default(false),
  description: z.string().trim().max(300).optional(),
});

const BindingSchema = z.object({
  source: z.enum(["data", "state", "context", "literal"]),
  path: z.string().trim().max(180),
  fallback: JsonPrimitiveSchema.optional(),
});

const WidgetFunctionInputSchema = z.object({
  name: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  binding: BindingSchema,
});

export const WidgetFunctionSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum([
    "open_link",
    "send_message",
    "dismiss",
    "set_variables",
    "client_event",
    "server_action",
  ]),
  inputs: z.array(WidgetFunctionInputSchema).max(20).default([]),
  returns: z.array(WidgetSchemaFieldSchema).max(40).default([]),
  waitForResponse: z.boolean().default(false),
  config: z
    .object({
      url: z.string().trim().url().max(2048).optional(),
      message: z.string().trim().max(500).optional(),
      eventName: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/).optional(),
      variable: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).optional(),
      method: z.enum(["GET", "POST", "PUT", "PATCH"]).optional(),
      authorization: z.string().max(1000).optional(),
      bodyTemplate: z.string().max(5000).optional(),
      nextState: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).optional(),
    })
    .default({}),
});

export const WidgetNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
    type: z.enum([
      "card",
      "stack",
      "row",
      "title",
      "text",
      "image",
      "badge",
      "button",
      "input",
      "checkbox",
      "product_carousel",
      "lead_form",
      "appointment",
      "order_tracking",
    ]),
    text: z.string().trim().max(500).optional(),
    binding: BindingSchema.optional(),
    functionId: z.string().trim().max(64).optional(),
    children: z.array(WidgetNodeSchema).max(30).default([]),
    props: z
      .object({
        variant: z.enum(["default", "primary", "secondary", "success", "warning"]).optional(),
        placeholder: z.string().trim().max(160).optional(),
        alt: z.string().trim().max(200).optional(),
        field: z.string().trim().max(64).optional(),
      })
      .default({}),
  }),
);

export const WidgetStateSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
  label: z.string().trim().min(1).max(120),
  initial: z.boolean().default(false),
  visibleNodeIds: z.array(z.string().trim().max(64)).max(100).default([]),
});

export const WidgetDefinitionSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    template: z.enum(["product_carousel", "lead_capture", "appointment", "order_tracking", "custom"]),
    schema: z.array(WidgetSchemaFieldSchema).max(80),
    defaults: z.record(z.unknown()).default({}),
    root: WidgetNodeSchema,
    functions: z.array(WidgetFunctionSchema).max(30).default([]),
    states: z.array(WidgetStateSchema).max(20).default([]),
  })
  .superRefine((definition, context) => {
    const fields = new Set<string>();
    for (const field of definition.schema) {
      if (fields.has(field.name)) context.addIssue({ code: "custom", message: `Campo duplicato: ${field.name}` });
      fields.add(field.name);
    }
    const functions = new Set<string>();
    for (const fn of definition.functions) {
      if (functions.has(fn.id)) context.addIssue({ code: "custom", message: `Funzione duplicata: ${fn.id}` });
      functions.add(fn.id);
      if (fn.type === "open_link" && !fn.config.url && !fn.inputs.some((input) => input.name === "url")) {
        context.addIssue({ code: "custom", message: `La funzione ${fn.id} richiede un URL` });
      }
      if (fn.type === "send_message" && !fn.config.message && !fn.inputs.some((input) => input.name === "message")) {
        context.addIssue({ code: "custom", message: `La funzione ${fn.id} richiede un messaggio` });
      }
      if (fn.type === "set_variables" && !fn.config.variable) {
        context.addIssue({ code: "custom", message: `La funzione ${fn.id} richiede una variabile` });
      }
      if (fn.type === "client_event" && !fn.config.eventName) {
        context.addIssue({ code: "custom", message: `La funzione ${fn.id} richiede un nome evento` });
      }
      if (fn.type === "server_action" && !fn.config.url) {
        context.addIssue({ code: "custom", message: `La funzione ${fn.id} richiede un endpoint` });
      }
    }
    let nodes = 0;
    const ids = new Set<string>();
    const visit = (node: z.infer<typeof WidgetNodeSchema>, depth: number) => {
      nodes += 1;
      if (depth > 8) context.addIssue({ code: "custom", message: "Il widget supera 8 livelli" });
      if (ids.has(node.id)) context.addIssue({ code: "custom", message: `Nodo duplicato: ${node.id}` });
      ids.add(node.id);
      if (node.functionId && !functions.has(node.functionId)) {
        context.addIssue({ code: "custom", message: `Funzione non trovata: ${node.functionId}` });
      }
      node.children.forEach((child: z.infer<typeof WidgetNodeSchema>) => visit(child, depth + 1));
    };
    visit(definition.root, 1);
    if (nodes > 150) context.addIssue({ code: "custom", message: "Il widget supera 150 componenti" });
    const initialStates = definition.states.filter((state) => state.initial);
    if (definition.states.length && initialStates.length !== 1) {
      context.addIssue({ code: "custom", message: "Definisci esattamente uno stato iniziale" });
    }
    const stateIds = new Set(definition.states.map((state) => state.id));
    for (const fn of definition.functions) {
      if (fn.config.nextState && !stateIds.has(fn.config.nextState)) {
        context.addIssue({ code: "custom", message: `Stato non trovato: ${fn.config.nextState}` });
      }
    }
  });

export type WidgetDefinition = z.infer<typeof WidgetDefinitionSchema>;

const productSchema = [
  { name: "products", type: "product_list", label: "Prodotti", required: true },
] as const;

export function defaultWidgetDefinition(
  template: WidgetDefinition["template"],
  values: { name?: string; description?: string; title?: string; body?: string; label?: string; url?: string } = {},
): WidgetDefinition {
  const title = values.title || ({ product_carousel: "Scelti per te", lead_capture: "Lascia i tuoi contatti", appointment: "Prenota un appuntamento", order_tracking: "Controlla il tuo ordine", custom: "Esperienza interattiva" } as const)[template];
  const body = values.body || values.description || "Completa questa azione direttamente nella conversazione.";
  const base = {
    version: 1 as const,
    name: values.name || `Widget ${template}`,
    description: values.description || "",
    template,
    defaults: { title, body, label: values.label || "Continua", ...(values.url ? { url: values.url } : {}) },
    functions: [] as z.infer<typeof WidgetFunctionSchema>[],
    states: [{ id: "ready", label: "Pronto", initial: true, visibleNodeIds: ["root"] }],
  };
  if (template === "product_carousel") {
    return WidgetDefinitionSchema.parse({ ...base, schema: productSchema, root: { id: "root", type: "product_carousel", children: [] }, functions: [
      { id: "open_product", label: "Apri prodotto", type: "open_link", inputs: [{ name: "url", binding: { source: "data", path: "productUrl" } }], config: {} },
      { id: "add_to_cart", label: values.label || "Aggiungi al carrello", type: "client_event", inputs: [{ name: "variantId", binding: { source: "data", path: "variantId" } }], config: { eventName: "litx:add_to_cart" } },
    ] });
  }
  if (template === "lead_capture") return WidgetDefinitionSchema.parse({ ...base, schema: [
    { name: "name", type: "string", label: "Nome", required: true },
    { name: "email", type: "email", label: "Email", required: false },
    { name: "phone", type: "string", label: "Telefono", required: false },
    { name: "company", type: "string", label: "Azienda", required: false },
    { name: "consent", type: "boolean", label: "Consenso", required: true },
  ], root: { id: "root", type: "lead_form", children: [] } });
  if (template === "appointment") return WidgetDefinitionSchema.parse({ ...base, schema: [
    { name: "url", type: "url", label: "Calendario", required: true },
  ], root: { id: "root", type: "appointment", children: [] }, functions: [
    { id: "open_calendar", label: values.label || "Apri calendario", type: "open_link", inputs: [{ name: "url", binding: { source: "data", path: "url", fallback: values.url || "https://example.com" } }], config: {} },
  ] });
  if (template === "order_tracking") return WidgetDefinitionSchema.parse({ ...base, schema: [
    { name: "orderNumber", type: "string", label: "Numero ordine", required: true },
    { name: "email", type: "email", label: "Email dell’acquisto", required: true },
  ], root: { id: "root", type: "order_tracking", children: [] } });
  return WidgetDefinitionSchema.parse({ ...base, schema: [], root: { id: "root", type: "card", children: [
    { id: "title", type: "title", text: title, children: [] },
    { id: "body", type: "text", text: body, children: [] },
  ] } });
}

export function widgetDefinitionFromConfig(config: Record<string, unknown>) {
  const parsed = WidgetDefinitionSchema.safeParse(config.definition);
  if (parsed.success) return parsed.data;
  const template = z.enum(["product_carousel", "lead_capture", "appointment", "order_tracking"]).catch("product_carousel").parse(config.template);
  return defaultWidgetDefinition(template, {
    name: typeof config.name === "string" ? config.name : undefined,
    title: typeof config.title === "string" ? config.title : undefined,
    body: typeof config.description === "string" ? config.description : undefined,
    label: typeof config.label === "string" ? config.label : undefined,
    url: typeof config.url === "string" ? config.url : undefined,
  });
}

export function resolveWidgetBinding(binding: z.infer<typeof BindingSchema>, sources: { data?: unknown; state?: unknown; context?: unknown }) {
  if (binding.source === "literal") return binding.path;
  const root = sources[binding.source];
  const value = binding.path.split(".").filter(Boolean).reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, root);
  return value ?? binding.fallback;
}

export function widgetDefinitionDiff(previous: WidgetDefinition | null, next: WidgetDefinition) {
  if (!previous) return ["Nuovo widget"];
  const changes: string[] = [];
  for (const key of ["name", "description", "template"] as const) if (previous[key] !== next[key]) changes.push(`${key} modificato`);
  if (JSON.stringify(previous.schema) !== JSON.stringify(next.schema)) changes.push("Schema modificato");
  if (JSON.stringify(previous.root) !== JSON.stringify(next.root)) changes.push("Struttura modificata");
  if (JSON.stringify(previous.functions) !== JSON.stringify(next.functions)) changes.push("Funzioni modificate");
  if (JSON.stringify(previous.states) !== JSON.stringify(next.states)) changes.push("Stati modificati");
  if (JSON.stringify(previous.defaults) !== JSON.stringify(next.defaults)) changes.push("Valori predefiniti modificati");
  return changes.length ? changes : ["Nessuna modifica funzionale"];
}

export function widgetRemoteUrls(definition: WidgetDefinition) {
  return Array.from(
    new Set(
      definition.functions
        .filter((fn) => fn.type === "server_action")
        .map((fn) => fn.config.url)
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

export function publicWidgetDefinition(definition: WidgetDefinition): WidgetDefinition {
  return {
    ...definition,
    functions: definition.functions.map((fn) =>
      fn.type === "server_action"
        ? {
            ...fn,
            config: {
              eventName: fn.config.eventName,
              nextState: fn.config.nextState,
            },
          }
        : fn,
    ),
  };
}

export function validateWidgetData(definition: WidgetDefinition, value: unknown) {
  return validateWidgetFields(definition.schema, value);
}

export function validateWidgetInitialData(definition: WidgetDefinition, value: unknown) {
  return validateWidgetFields(
    definition.schema.map((field) => ({ ...field, required: false })),
    value,
  );
}

export function validateWidgetFields(
  fields: z.infer<typeof WidgetSchemaFieldSchema>[],
  value: unknown,
) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let schema: z.ZodTypeAny;
    if (field.type === "number") schema = z.number().finite();
    else if (field.type === "boolean") schema = z.boolean();
    else if (field.type === "url") schema = z.string().url().max(2048);
    else if (field.type === "email") schema = z.string().email().max(254);
    else if (field.type === "product_list") schema = z.array(z.record(z.unknown())).max(50);
    else if (field.type === "order_status") schema = z.record(z.unknown());
    else schema = z.string().max(5000);
    shape[field.name] = field.required ? schema : schema.optional();
  }
  return z.object(shape).passthrough().parse(value);
}
