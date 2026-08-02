import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { checkRateLimit } from "./rate-limit";
import { parseWooCommerceConfig, wooCommerceRequest } from "./woocommerce-auth";
import {
  normalizedOrderNumber,
  parseOrderLookupMessage,
  presentVerifiedWooOrder,
  redactOrderLookupMessage,
} from "./woocommerce-order-tracking-contract";
export { parseOrderLookupMessage, presentVerifiedWooOrder, redactOrderLookupMessage } from "./woocommerce-order-tracking-contract";

const VERIFY_PROMPT = "Per controllare l’ordine in modo sicuro, inviami nello stesso messaggio il numero d’ordine e l’email usata durante l’acquisto. Esempio: Ordine 12345, nome@example.com. I dati di verifica non verranno salvati nella conversazione.";
const GENERIC_FAILURE = "Non riesco a verificare quei dati. Controlla numero d’ordine ed email e riprova; per proteggere il cliente non posso indicare quale dato non corrisponde.";

export interface WooOrderLookupResult {
  handled: boolean;
  redactedUserText: string;
  response?: string;
  verified?: boolean;
  handoff?: boolean;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left.trim().toLowerCase());
  const b = Buffer.from(right.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

async function findWooOrder(config: ReturnType<typeof parseWooCommerceConfig>, requestedNumber: string) {
  const normalized = normalizedOrderNumber(requestedNumber);
  if (/^\d{1,20}$/.test(normalized)) {
    try {
      const direct = await wooCommerceRequest(config, `/wp-json/wc/v3/orders/${encodeURIComponent(normalized)}`);
      if (normalizedOrderNumber(direct?.number || direct?.id) === normalized) return direct;
    } catch {}
  }
  const candidates = await wooCommerceRequest(config, `/wp-json/wc/v3/orders?search=${encodeURIComponent(requestedNumber)}&per_page=20`);
  return (Array.isArray(candidates) ? candidates : []).find((item: any) => normalizedOrderNumber(item?.number || item?.id) === normalized);
}

export async function tryWooCommerceOrderLookup(input: {
  botId: string;
  text: string;
  previousAssistantText?: string;
  rateLimitScope: string;
}): Promise<WooOrderLookupResult> {
  const parsed = parseOrderLookupMessage(input.text, input.previousAssistantText);
  if (!parsed.hasIntent) return { handled: false, redactedUserText: input.text };
  const redactedUserText = redactOrderLookupMessage(input.text, parsed);
  const connection = await prisma.integrationConnection.findUnique({
    where: { botId_provider: { botId: input.botId, provider: "woocommerce" } },
  });
  if (!connection?.enabled || connection.status !== "connected") {
    return {
      handled: true,
      redactedUserText,
      response: "Non posso verificare l’ordine in tempo reale da questa chat. Ti metto in contatto con un operatore che potrà controllarlo in sicurezza.",
      verified: false,
      handoff: true,
    };
  }
  if (!parsed.orderNumber || !parsed.email) {
    return { handled: true, redactedUserText, response: VERIFY_PROMPT, verified: false };
  }

  const subject = createHash("sha256").update(`${input.botId}:${parsed.orderNumber}:${parsed.email}`).digest("hex");
  const [scopeLimit, subjectLimit] = await Promise.all([
    checkRateLimit(`woo-order-scope:${input.botId}:${input.rateLimitScope}`, 8, 15 * 60_000),
    checkRateLimit(`woo-order-subject:${subject}`, 4, 15 * 60_000),
  ]);
  if (!scopeLimit.allowed || !subjectLimit.allowed) {
    return { handled: true, redactedUserText, response: "Troppi tentativi di verifica. Attendi 15 minuti oppure contatta un operatore.", verified: false };
  }

  try {
    const order = await findWooOrder(parseWooCommerceConfig(connection.config), parsed.orderNumber);
    const billingEmail = String(order?.billing?.email || "");
    if (!order || !billingEmail || !safeEqual(billingEmail, parsed.email)) {
      return { handled: true, redactedUserText, response: GENERIC_FAILURE, verified: false };
    }
    return { handled: true, redactedUserText, response: presentVerifiedWooOrder(order), verified: true };
  } catch {
    return { handled: true, redactedUserText, response: GENERIC_FAILURE, verified: false };
  }
}
