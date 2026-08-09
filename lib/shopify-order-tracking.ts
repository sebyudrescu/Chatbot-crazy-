import "server-only";

import { prisma } from "./db";
import { checkRateLimit } from "./rate-limit";
import { ensureShopifyAccessToken, parseShopifyConfig, SHOPIFY_API_VERSION } from "./shopify-auth";
import { encryptConfigSecrets } from "./secret-config";
import { orderLookupDigest, safeOrderLookupEqual } from "./order-lookup-security";
import { normalizeShopifyOrderCard, matchesShopifyOrderNumber, presentShopifyOrder, type ShopifyOrderNode } from "./shopify-order-tracking-contract";
import { normalizedOrderNumber, parseOrderLookupMessage, redactOrderLookupMessage } from "./woocommerce-order-tracking-contract";
import type { OrderStatusCard } from "./commerce-types";

const VERIFY_PROMPT = "Per controllare l’ordine in modo sicuro, inserisci il numero d’ordine e l’email usata durante l’acquisto. I dati di verifica non verranno salvati nella conversazione.";
const GENERIC_FAILURE = "Non riesco a verificare quei dati. Controlla numero d’ordine ed email e riprova; per proteggere il cliente non posso indicare quale dato non corrisponde.";
const PERSISTED_SUCCESS = "Ordine verificato. Per proteggere i tuoi dati, i dettagli non sono stati salvati nella conversazione.";

export interface ShopifyOrderLookupResult {
  handled: boolean;
  redactedUserText: string;
  response?: string;
  persistedResponse?: string;
  verified?: boolean;
  handoff?: boolean;
  orderLookupForm?: boolean;
  orderStatusCard?: OrderStatusCard;
  provider?: "shopify";
  capability?: "ready" | "scope_required" | "pcd_required" | "unavailable";
}

const ORDER_QUERY = `query LitXOrderLookup($query: String!) {
  shop { name }
  orders(first: 5, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {
      name email createdAt updatedAt displayFulfillmentStatus statusPageUrl
      lineItems(first: 50) { nodes { title name variantTitle quantity image { url } } }
      fulfillments(first: 20) {
        name status displayStatus estimatedDeliveryAt updatedAt
        trackingInfo(first: 10) { company number url }
      }
    }
  }
}`;

function isThrottled(response: Response, payload: any) {
  return response.status === 429 || payload?.errors?.some((error: any) => error?.extensions?.code === "THROTTLED");
}

function isProtectedDataDenied(payload: any) {
  return payload?.errors?.some((error: any) => {
    const code = String(error?.extensions?.code || "").toUpperCase();
    const message = String(error?.message || "").toLowerCase();
    return code === "ACCESS_DENIED" || message.includes("protected customer") || message.includes("not approved") || message.includes("access denied");
  });
}

async function shopifyOrderRequest(shop: string, token: string, query: string) {
  const endpoint = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: ORDER_QUERY, variables: { query } }),
    });
    const payload = await response.json().catch(() => null) as any;
    if (isThrottled(response, payload) && attempt === 0) {
      const throttle = payload?.extensions?.cost?.throttleStatus;
      const waitMs = throttle?.restoreRate > 0
        ? Math.min(1_000, Math.max(100, Math.ceil(((1 - Number(throttle.currentlyAvailable || 0)) / Number(throttle.restoreRate)) * 1000)))
        : 350;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (isProtectedDataDenied(payload)) return { capability: "pcd_required" as const };
    if (!response.ok || payload?.errors?.length || !payload?.data?.orders) return { capability: "unavailable" as const };
    return { capability: "ready" as const, data: payload.data as { shop?: { name?: string }; orders: { nodes?: ShopifyOrderNode[] } } };
  }
  return { capability: "unavailable" as const };
}

export async function tryShopifyOrderLookup(input: {
  botId: string;
  text: string;
  previousAssistantText?: string;
  rateLimitScope: string;
}): Promise<ShopifyOrderLookupResult> {
  const parsed = parseOrderLookupMessage(input.text, input.previousAssistantText);
  if (!parsed.hasIntent) return { handled: false, redactedUserText: input.text };
  const redactedUserText = redactOrderLookupMessage(input.text, parsed);
  const connection = await prisma.integrationConnection.findUnique({
    where: { botId_provider: { botId: input.botId, provider: "shopify" } },
  });
  if (!connection?.enabled || connection.status !== "connected") return { handled: false, redactedUserText };
  const config = parseShopifyConfig(connection.config);
  const grantedScopes = new Set(String(config.scopes || "").split(",").map((scope) => scope.trim()).filter(Boolean));
  if (!grantedScopes.has("read_orders")) {
    return {
      handled: true,
      redactedUserText,
      response: "Il tracking Shopify richiede una nuova autorizzazione del negozio. Ho inoltrato la richiesta a un operatore.",
      persistedResponse: "Tracking Shopify non disponibile: autorizzazione read_orders richiesta.",
      verified: false,
      handoff: true,
      provider: "shopify",
      capability: "scope_required",
    };
  }
  if (!parsed.orderNumber || !parsed.email) {
    return { handled: true, redactedUserText, response: VERIFY_PROMPT, persistedResponse: VERIFY_PROMPT, verified: false, orderLookupForm: true, provider: "shopify", capability: "ready" };
  }

  const normalizedNumber = normalizedOrderNumber(parsed.orderNumber);
  const normalizedEmail = parsed.email.trim().toLowerCase();
  const subject = orderLookupDigest(`${input.botId}:${normalizedNumber}:${normalizedEmail}`);
  const [scopeLimit, subjectLimit] = await Promise.all([
    checkRateLimit(`shopify-order-scope:${orderLookupDigest(`${input.botId}:${input.rateLimitScope}`)}`, 8, 15 * 60_000),
    checkRateLimit(`shopify-order-subject:${subject}`, 4, 15 * 60_000),
  ]);
  if (!scopeLimit.allowed || !subjectLimit.allowed) {
    const response = "Troppi tentativi di verifica. Attendi 15 minuti oppure contatta un operatore.";
    return { handled: true, redactedUserText, response, persistedResponse: response, verified: false, provider: "shopify", capability: "ready" };
  }

  try {
    const { token, config: refreshedConfig } = await ensureShopifyAccessToken(connection);
    const shop = String(refreshedConfig.shopDomain || connection.externalAccountId || "");
    const query = `name:${normalizedNumber} email:${normalizedEmail}`;
    const result = await shopifyOrderRequest(shop, token, query);
    if (result.capability === "pcd_required") {
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          config: JSON.stringify(encryptConfigSecrets({ ...refreshedConfig, orderTrackingPcdStatus: "required" as const })),
          lastError: "Tracking ordini: abilita Protected Customer Data livello 2 e campo Email nella Shopify App",
        },
      }).catch(() => undefined);
      return {
        handled: true,
        redactedUserText,
        response: "Il tracking ordini è in fase di configurazione. Ho inoltrato la richiesta a un operatore.",
        persistedResponse: "Tracking Shopify non disponibile: Protected Customer Data da configurare.",
        verified: false,
        handoff: true,
        provider: "shopify",
        capability: "pcd_required",
      };
    }
    if (result.capability !== "ready" || !result.data) throw new Error("Shopify non disponibile");
    const candidates = Array.isArray(result.data.orders.nodes) ? result.data.orders.nodes : [];
    const order = candidates.find((item) => matchesShopifyOrderNumber(item.name, parsed.orderNumber!) && safeOrderLookupEqual(String(item.email || ""), normalizedEmail));
    if (!order) return { handled: true, redactedUserText, response: GENERIC_FAILURE, persistedResponse: GENERIC_FAILURE, verified: false, provider: "shopify", capability: "ready" };
    const card = normalizeShopifyOrderCard(order, result.data.shop?.name || connection.displayName || "Negozio Shopify");
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        config: JSON.stringify(encryptConfigSecrets({ ...refreshedConfig, orderTrackingPcdStatus: "ready" as const })),
        lastError: null,
        lastTestedAt: new Date(),
      },
    }).catch(() => undefined);
    return {
      handled: true,
      redactedUserText,
      response: presentShopifyOrder(card),
      persistedResponse: PERSISTED_SUCCESS,
      verified: true,
      orderStatusCard: card,
      provider: "shopify",
      capability: "ready",
    };
  } catch {
    return { handled: true, redactedUserText, response: GENERIC_FAILURE, persistedResponse: GENERIC_FAILURE, verified: false, provider: "shopify", capability: "unavailable" };
  }
}
