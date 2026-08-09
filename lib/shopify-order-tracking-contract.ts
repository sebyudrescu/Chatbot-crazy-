import { orderStatusCardSchema, safeHttpsUrl, type OrderStatusCard } from "./commerce-types";
import { normalizedOrderNumber } from "./woocommerce-order-tracking-contract";

type ShopifyTracking = { company?: unknown; number?: unknown; url?: unknown };
type ShopifyFulfillment = {
  name?: unknown;
  displayStatus?: unknown;
  status?: unknown;
  estimatedDeliveryAt?: unknown;
  updatedAt?: unknown;
  trackingInfo?: ShopifyTracking[];
};
type ShopifyLineItem = {
  title?: unknown;
  name?: unknown;
  variantTitle?: unknown;
  quantity?: unknown;
  image?: { url?: unknown } | null;
};
export type ShopifyOrderNode = {
  name?: unknown;
  email?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  displayFulfillmentStatus?: unknown;
  statusPageUrl?: unknown;
  lineItems?: { nodes?: ShopifyLineItem[] };
  fulfillments?: ShopifyFulfillment[];
};

const STATUS_LABELS: Record<string, { label: string; tone: OrderStatusCard["status"]["tone"] }> = {
  ATTEMPTED_DELIVERY: { label: "Tentativo di consegna", tone: "warning" },
  CANCELED: { label: "Spedizione annullata", tone: "danger" },
  CANCELLED: { label: "Spedizione annullata", tone: "danger" },
  CARRIER_PICKED_UP: { label: "Ritirato dal corriere", tone: "info" },
  CONFIRMED: { label: "Confermato", tone: "info" },
  DELAYED: { label: "In ritardo", tone: "warning" },
  DELIVERED: { label: "Consegnato", tone: "success" },
  FAILURE: { label: "Problema con la spedizione", tone: "danger" },
  FULFILLED: { label: "Spedito", tone: "info" },
  IN_PROGRESS: { label: "In preparazione", tone: "info" },
  IN_TRANSIT: { label: "In transito", tone: "info" },
  LABEL_PRINTED: { label: "Etichetta stampata", tone: "info" },
  LABEL_PURCHASED: { label: "Etichetta creata", tone: "info" },
  LABEL_VOIDED: { label: "Etichetta annullata", tone: "warning" },
  MARKED_AS_FULFILLED: { label: "Spedito", tone: "info" },
  NOT_DELIVERED: { label: "Non consegnato", tone: "danger" },
  ON_HOLD: { label: "In attesa", tone: "warning" },
  OUT_FOR_DELIVERY: { label: "In consegna", tone: "info" },
  PARTIALLY_FULFILLED: { label: "Spedizione parziale", tone: "info" },
  PICKED_UP: { label: "Ritirato", tone: "success" },
  READY_FOR_PICKUP: { label: "Pronto per il ritiro", tone: "success" },
  SCHEDULED: { label: "Spedizione programmata", tone: "info" },
  SUBMITTED: { label: "In preparazione", tone: "info" },
  UNFULFILLED: { label: "Ordine confermato", tone: "neutral" },
};

function text(value: unknown, max: number) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function iso(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function fulfillmentCode(value: unknown) {
  return text(value, 80).toUpperCase().replace(/[^A-Z_]/g, "") || "UNFULFILLED";
}

export function shopifyStatusLabel(value: unknown) {
  const code = fulfillmentCode(value);
  return { code, ...(STATUS_LABELS[code] || { label: "In elaborazione", tone: "neutral" as const }) };
}

function statusRank(code: string) {
  if (["FAILURE", "NOT_DELIVERED", "CANCELED", "CANCELLED", "DELAYED", "ATTEMPTED_DELIVERY"].includes(code)) return 90;
  if (["DELIVERED", "PICKED_UP"].includes(code)) return 80;
  if (["OUT_FOR_DELIVERY", "READY_FOR_PICKUP"].includes(code)) return 70;
  if (["IN_TRANSIT", "CARRIER_PICKED_UP"].includes(code)) return 60;
  if (["FULFILLED", "MARKED_AS_FULFILLED", "LABEL_PRINTED", "LABEL_PURCHASED"].includes(code)) return 50;
  if (["IN_PROGRESS", "SUBMITTED", "SCHEDULED", "PARTIALLY_FULFILLED"].includes(code)) return 30;
  return 10;
}

function milestones(code: string): OrderStatusCard["milestones"] {
  const attention = ["FAILURE", "NOT_DELIVERED", "CANCELED", "CANCELLED", "DELAYED", "ATTEMPTED_DELIVERY"].includes(code);
  const currentIndex = code === "DELIVERED" || code === "PICKED_UP" ? 4
    : code === "OUT_FOR_DELIVERY" || code === "READY_FOR_PICKUP" ? 3
      : code === "IN_TRANSIT" || code === "CARRIER_PICKED_UP" ? 3
        : ["FULFILLED", "MARKED_AS_FULFILLED", "LABEL_PRINTED", "LABEL_PURCHASED"].includes(code) ? 2
          : ["IN_PROGRESS", "SUBMITTED", "SCHEDULED", "PARTIALLY_FULFILLED"].includes(code) ? 1 : 0;
  const labels = [
    ["confirmed", "Confermato"],
    ["preparing", "Preparazione"],
    ["shipped", "Spedito"],
    ["in_transit", "In transito"],
    ["delivered", "Consegnato"],
  ] as const;
  return labels.map(([key, label], index) => ({
    key,
    label,
    state: attention && index === currentIndex ? "attention" : index < currentIndex ? "complete" : index === currentIndex ? "current" : "pending",
  }));
}

export function normalizeShopifyOrderCard(order: ShopifyOrderNode, storeName: string): OrderStatusCard {
  const shipmentData = (Array.isArray(order.fulfillments) ? order.fulfillments : []).slice(0, 20).map((fulfillment, index) => {
    const status = shopifyStatusLabel(fulfillment.displayStatus || fulfillment.status);
    const tracking = (Array.isArray(fulfillment.trackingInfo) ? fulfillment.trackingInfo : []).slice(0, 10).map((item) => ({
      carrier: text(item.company, 120) || undefined,
      number: text(item.number, 160) || undefined,
      url: safeHttpsUrl(text(item.url, 2048)),
    })).filter((item) => item.carrier || item.number || item.url);
    return {
      label: text(fulfillment.name, 120) || `Spedizione ${index + 1}`,
      statusCode: status.code,
      statusLabel: status.label,
      estimatedDeliveryAt: iso(fulfillment.estimatedDeliveryAt),
      updatedAt: iso(fulfillment.updatedAt),
      tracking,
    };
  });
  const highest = shipmentData.reduce((current, item) => statusRank(item.statusCode) > statusRank(current) ? item.statusCode : current, fulfillmentCode(order.displayFulfillmentStatus));
  const orderStatus = shopifyStatusLabel(highest);
  const eta = shipmentData.map((item) => item.estimatedDeliveryAt).filter((item): item is string => Boolean(item)).sort()[0];
  const items = (Array.isArray(order.lineItems?.nodes) ? order.lineItems!.nodes! : []).slice(0, 50).map((item) => ({
    title: text(item.title || item.name, 240) || "Articolo",
    variantTitle: text(item.variantTitle, 160) || undefined,
    quantity: Math.max(1, Math.min(10_000, Number(item.quantity) || 1)),
    imageUrl: safeHttpsUrl(text(item.image?.url, 2048)),
  }));
  const statusPageUrl = safeHttpsUrl(text(order.statusPageUrl, 2048));
  const actions: OrderStatusCard["actions"] = [];
  for (const shipment of shipmentData) {
    for (const item of shipment.tracking) {
      if (item.url && !actions.some((action) => action.url === item.url)) actions.push({ type: "track", label: shipmentData.length > 1 ? `Traccia ${shipment.label}` : "Segui la spedizione", url: item.url });
    }
  }
  if (statusPageUrl) actions.push({ type: "order_status", label: "Apri pagina ordine", url: statusPageUrl });

  return orderStatusCardSchema.parse({
    version: 1,
    provider: "shopify",
    storeName: text(storeName, 160) || "Negozio Shopify",
    orderNumber: text(order.name, 80) || "Ordine",
    createdAt: iso(order.createdAt) || new Date(0).toISOString(),
    updatedAt: iso(order.updatedAt),
    estimatedDeliveryAt: eta,
    status: orderStatus,
    milestones: milestones(orderStatus.code),
    items,
    shipments: shipmentData,
    actions: actions.slice(0, 12),
  });
}

export function presentShopifyOrder(card: OrderStatusCard) {
  const lines = [`Ordine ${card.orderNumber}: **${card.status.label}**.`];
  if (card.shipments.length > 1) lines.push(`${card.shipments.length} spedizioni separate.`);
  if (card.estimatedDeliveryAt) lines.push(`Consegna stimata: ${new Intl.DateTimeFormat("it-IT", { dateStyle: "long" }).format(new Date(card.estimatedDeliveryAt))}.`);
  for (const [index, shipment] of card.shipments.entries()) {
    const prefix = card.shipments.length > 1 ? `${shipment.label}: ` : "";
    lines.push(`${prefix}${shipment.statusLabel}.`);
    const tracking = shipment.tracking[0];
    if (tracking?.carrier) lines.push(`Corriere: ${tracking.carrier}.`);
    if (tracking?.number) lines.push(`Tracking: ${tracking.number}.`);
    if (tracking?.url) lines.push(`Segui la spedizione: ${tracking.url}`);
    if (index >= 4) break;
  }
  if (!card.shipments.length) lines.push("Il tracking apparirà quando il negozio affiderà il pacco al corriere.");
  const orderPage = card.actions.find((action) => action.type === "order_status");
  if (orderPage) lines.push(`Dettagli ufficiali: ${orderPage.url}`);
  return lines.join("\n");
}

export function matchesShopifyOrderNumber(candidate: unknown, requested: string) {
  return normalizedOrderNumber(candidate) === normalizedOrderNumber(requested);
}

