import "server-only";
import { prisma } from "./db";
import { decryptConfigSecrets } from "./secret-config";
import { assertSafeHttpsRemoteUrl } from "./url-safety";
import {
  resolveWidgetBinding,
  validateWidgetFields,
  widgetDefinitionFromConfig,
} from "./widget-definition";
import { claimIdempotentExecution } from "./idempotency-claim";

export interface WidgetFunctionPayload {
  data: Record<string, unknown>;
  state: Record<string, unknown>;
  context: { botId?: string; conversationId?: string };
}

export class WidgetFunctionInProgressError extends Error {
  constructor() {
    super("Funzione widget già in esecuzione");
    this.name = "WidgetFunctionInProgressError";
  }
}

export class WidgetFunctionAlreadyFailedError extends Error {
  constructor(message?: string | null) {
    super(message || "Questa esecuzione è già fallita; riprova con una nuova richiesta");
    this.name = "WidgetFunctionAlreadyFailedError";
  }
}

async function readJson(response: Response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 1_000_000) throw new Error("Risposta server action troppo grande");
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > 1_000_000) {
      await reader.cancel();
      throw new Error("Risposta server action troppo grande");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function executeWidgetServerFunction(input: {
  actionId: string;
  functionId: string;
  payload: WidgetFunctionPayload;
  idempotencyKey: string;
}) {
  const action = await prisma.agentAction.findUnique({ where: { id: input.actionId } });
  if (!action || !action.enabled || !["show_widget", "api_widget"].includes(action.type)) {
    throw new Error("Funzione widget non disponibile");
  }
  if (input.payload.context.botId && input.payload.context.botId !== action.botId) {
    throw new Error("Agente non valido");
  }
  const config = decryptConfigSecrets(JSON.parse(action.config)) as Record<string, unknown>;
  const definition = widgetDefinitionFromConfig(config);
  const fn = definition.functions.find(
    (item) => item.id === input.functionId && item.type === "server_action",
  );
  if (!fn?.config.url) throw new Error("Server action non trovata");
  const claim = await claimIdempotentExecution(
    () => prisma.actionExecution.create({
      data: {
        actionId: action.id,
        conversationId: input.payload.context.conversationId,
        idempotencyKey: input.idempotencyKey,
        success: false,
        status: "pending",
        input: JSON.stringify({ functionId: fn.id }),
      },
    }),
    () => prisma.actionExecution.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    }),
  );
  if (!claim.claimed) {
    const existing = claim.execution;
    if (existing.status === "success" && existing.success && existing.output) {
      return JSON.parse(existing.output);
    }
    if (existing.status === "pending") throw new WidgetFunctionInProgressError();
    throw new WidgetFunctionAlreadyFailedError(existing.error);
  }
  const execution = claim.execution;
  const started = Date.now();
  try {
    const url = await assertSafeHttpsRemoteUrl(fn.config.url);
    const inputs = Object.fromEntries(
      fn.inputs.map((item) => [
        item.name,
        resolveWidgetBinding(item.binding, input.payload),
      ]),
    );
    const render = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(render);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, render(item)]),
        );
      }
      if (typeof value !== "string") return value;
      return Object.entries(inputs).reduce(
        (result, [key, replacement]) =>
          result.replaceAll(`{{input.${key}}}`, String(replacement ?? "")),
        value,
      );
    };
    const method = fn.config.method || "POST";
    const body = method === "GET"
      ? undefined
      : JSON.stringify(render(JSON.parse(fn.config.bodyTemplate || "{}")));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "LitX-Widget-Function/1.0",
          "Idempotency-Key": input.idempotencyKey,
          ...(fn.config.authorization ? { Authorization: fn.config.authorization } : {}),
        },
        body,
        redirect: "manual",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Server action HTTP ${response.status}`);
      const result = await readJson(response);
      const data = fn.returns.length ? validateWidgetFields(fn.returns, result) : result;
      await prisma.actionExecution.update({
        where: { id: execution.id },
        data: {
          success: true,
          status: "success",
          output: JSON.stringify(data),
          durationMs: Date.now() - started,
        },
      });
      return data;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    await prisma.actionExecution.update({
      where: { id: execution.id },
      data: {
        success: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Funzione non riuscita",
        durationMs: Date.now() - started,
      },
    });
    throw error;
  }
}
