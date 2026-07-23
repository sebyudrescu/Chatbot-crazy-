import "server-only";
import { prisma } from "./db";
import { deliverWebhook, type WebhookDeliveryResult } from "./webhook-delivery";
import { decryptConfigSecrets } from "./secret-config";

const parse = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export async function emitIntegrationWebhook(input: {
  botId: string;
  event: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}): Promise<WebhookDeliveryResult | null> {
  const connection = await prisma.integrationConnection.findUnique({
    where: { botId_provider: { botId: input.botId, provider: "webhook" } },
  });
  if (!connection?.enabled) return null;
  const config = decryptConfigSecrets(parse<Record<string, string>>(connection.config, {}));
  const endpoint = config.endpoint || "";
  const subscribedEvents = (config.events || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (subscribedEvents.length && !subscribedEvents.includes(input.event)) return null;

  const result = await deliverWebhook({
    url: endpoint,
    event: input.event,
    payload: input.payload,
    secret: config.secret || undefined,
    idempotencyKey: input.idempotencyKey,
  }).catch((error) => ({
    deliveryId: crypto.randomUUID(),
    success: false,
    status: null,
    attempts: 0,
    durationMs: 0,
    responsePreview: "",
    error: error instanceof Error ? error.message : "Consegna webhook non riuscita",
  }));

  await prisma.$transaction([
    prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        status: result.success ? "connected" : "error",
        lastTestedAt: new Date(),
        lastError: result.success ? null : result.error,
      },
    }),
    prisma.event.create({
      data: {
        botId: input.botId,
        eventType: result.success
          ? "integration.webhook.delivered"
          : "integration.webhook.failed",
        category: "integration",
        severity: result.success ? "info" : "error",
        success: result.success,
        durationMs: result.durationMs,
        errorMessage: result.error || null,
        metadata: JSON.stringify({
          deliveryId: result.deliveryId,
          integrationId: connection.id,
          event: input.event,
          status: result.status,
          attempts: result.attempts,
          endpointOrigin: (() => {
            try {
              return new URL(endpoint).origin;
            } catch {
              return "invalid";
            }
          })(),
        }),
      },
    }),
  ]);
  return result;
}
