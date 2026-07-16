import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { assertSafeRemoteUrl } from "./url-safety";

export interface WebhookDeliveryInput {
  url: string;
  event: string;
  payload: Record<string, unknown>;
  secret?: string;
  idempotencyKey: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
}

export interface WebhookDeliveryResult {
  deliveryId: string;
  success: boolean;
  status: number | null;
  attempts: number;
  durationMs: number;
  responsePreview: string;
  error: string;
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function signature(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")}`;
}

function shouldRetry(status: number | null) {
  return status === null || status === 408 || status === 425 || status === 429 || status >= 500;
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
}) {
  const expected = signature(input.secret, input.timestamp, input.body);
  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function deliverWebhook(
  input: WebhookDeliveryInput,
): Promise<WebhookDeliveryResult> {
  const url = await assertSafeRemoteUrl(input.url);
  if (
    url.protocol !== "https:" &&
    process.env.ALLOW_PRIVATE_WEBHOOK_FOR_TESTS !== "true"
  ) {
    throw new Error("I webhook richiedono un endpoint HTTPS pubblico");
  }
  if (input.secret && input.secret.length < 16) {
    throw new Error("Il segreto webhook deve contenere almeno 16 caratteri");
  }

  const deliveryId = randomUUID();
  const body = JSON.stringify({
    id: deliveryId,
    event: input.event,
    createdAt: new Date().toISOString(),
    data: input.payload,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts || 3, 5));
  const startedAt = Date.now();
  let lastStatus: number | null = null;
  let responsePreview = "";
  let lastError = "";
  let lastAttempt = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastAttempt = attempt;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs || 8000);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "LitX-Webhook/1.0",
        "X-LitX-Event": input.event,
        "X-LitX-Delivery": deliveryId,
        "X-LitX-Timestamp": timestamp,
        "Idempotency-Key": input.idempotencyKey,
      };
      if (input.secret) {
        headers["X-LitX-Signature"] = signature(input.secret, timestamp, body);
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        redirect: "manual",
        signal: controller.signal,
      });
      lastStatus = response.status;
      responsePreview = (await response.text()).slice(0, 500);
      if (response.ok) {
        return {
          deliveryId,
          success: true,
          status: response.status,
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          responsePreview,
          error: "",
        };
      }
      lastError = `Webhook HTTP ${response.status}`;
      if (!shouldRetry(response.status)) break;
    } catch (error) {
      lastStatus = null;
      lastError =
        error instanceof Error && error.name === "AbortError"
          ? "Timeout webhook"
          : error instanceof Error
            ? error.message
            : "Webhook non raggiungibile";
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxAttempts) {
      await wait((input.retryBaseMs || 250) * 2 ** (attempt - 1));
    }
  }

  return {
    deliveryId,
    success: false,
    status: lastStatus,
    attempts: lastAttempt,
    durationMs: Date.now() - startedAt,
    responsePreview,
    error: lastError || "Consegna webhook non riuscita",
  };
}
