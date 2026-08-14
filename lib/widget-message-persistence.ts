import { z } from "zod";
import { publicWidgetDefinition, WidgetDefinitionSchema } from "./widget-definition";

const SENSITIVE_KEY = /(?:email|e-mail|phone|telefono|password|secret|token|authorization|cookie|api[_-]?key|address|indirizzo|shipping|billing|customer|first[_-]?name|last[_-]?name|full[_-]?name|postal|zip)/i;
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_VALUE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const TOKEN_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~-]+|\b(?:sk|shpat|shpca|shpss)_[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrub(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .slice(0, 100)
        .map(([key, item]) => [key, scrub(item, depth + 1)]),
    );
  }
  if (typeof value === "string") {
    if (EMAIL_VALUE.test(value) || PHONE_VALUE.test(value) || TOKEN_VALUE.test(value)) return "[dato riservato]";
    return value.slice(0, 5000);
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean" || value === null) return value;
  return undefined;
}

const PersistedWidgetSchema = z.object({
  id: z.string().max(200),
  actionId: z.string().uuid(),
  definition: WidgetDefinitionSchema,
  data: z.record(z.unknown()),
});

export type PersistedDeclarativeWidget = z.infer<typeof PersistedWidgetSchema>;

export function prepareWidgetsForMessage(widgets: unknown): PersistedDeclarativeWidget[] {
  if (!Array.isArray(widgets)) return [];
  const result: PersistedDeclarativeWidget[] = [];
  let totalBytes = 0;
  for (const widget of widgets.slice(0, 5)) {
    const parsed = PersistedWidgetSchema.safeParse(widget);
    if (!parsed.success) continue;
    const candidate = {
      ...parsed.data,
      definition: publicWidgetDefinition(parsed.data.definition),
      data: scrub(parsed.data.data) as Record<string, unknown>,
    };
    const safeData = z.record(z.unknown()).safeParse(candidate.data);
    if (!safeData.success) continue;
    const safe = { ...candidate, data: safeData.data };
    const bytes = Buffer.byteLength(JSON.stringify(safe), "utf8");
    if (totalBytes + bytes > 128_000) continue;
    totalBytes += bytes;
    result.push(safe);
  }
  return result;
}

export function widgetsFromMessageMetadata(value: unknown): PersistedDeclarativeWidget[] {
  if (!value || typeof value !== "object") return [];
  const metadata = (value as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") return [];
  return prepareWidgetsForMessage((metadata as { declarativeWidgets?: unknown }).declarativeWidgets);
}
