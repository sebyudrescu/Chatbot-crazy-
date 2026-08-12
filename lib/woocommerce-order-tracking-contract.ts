const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const ORDER_PATTERNS = [
  /\b(?:ordine|order|numero\s+d[’']ordine|order\s+number|n[°º.]?)\s*[:#-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{1,39})\b/i,
  /#\s*([A-Z0-9][A-Z0-9-]{1,39})\b/i,
  /^\s*#\s*([A-Z0-9][A-Z0-9-]{1,39})\s*$/i,
] as const;
const ORDER_INTENT = /\b(ordine|order|spedizion|tracking|traccia|pacco|consegna|corriere)\b|dov['’]?e\s+(?:il\s+)?(?:mio\s+)?(?:ordine|pacco)/i;

export interface ParsedOrderLookup {
  orderNumber?: string;
  email?: string;
  hasIntent: boolean;
  containsCredentials: boolean;
}

export function normalizedOrderNumber(value: unknown) {
  return String(value || "").trim().replace(/^#/, "").toLowerCase();
}

function cleanLabel(value: unknown, fallback: string) {
  const text = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 120) || fallback;
}

function safeTrackingUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseOrderLookupMessage(text: string, previousAssistantText = ""): ParsedOrderLookup {
  const email = text.match(EMAIL_PATTERN)?.[0]?.toLowerCase();
  let orderNumber: string | undefined;
  for (const pattern of ORDER_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      orderNumber = match[1];
      break;
    }
  }
  const previousRequestedVerification = /numero d[’']ordine.*email|email.*numero d[’']ordine/i.test(previousAssistantText);
  const hasIntent = ORDER_INTENT.test(text) || (previousRequestedVerification && Boolean(email || orderNumber));
  return {
    orderNumber,
    email,
    hasIntent,
    containsCredentials: hasIntent && Boolean(email || orderNumber),
  };
}

export function redactOrderLookupMessage(text: string, parsed = parseOrderLookupMessage(text)) {
  if (!parsed.containsCredentials) return text;
  return "[Dati di verifica ordine rimossi automaticamente]";
}

function statusLabel(status: unknown) {
  const labels: Record<string, string> = {
    pending: "in attesa di pagamento",
    processing: "in preparazione",
    "on-hold": "in attesa",
    completed: "completato",
    cancelled: "annullato",
    refunded: "rimborsato",
    failed: "pagamento non riuscito",
    trash: "annullato",
  };
  return labels[String(status || "").toLowerCase()] || cleanLabel(status, "in elaborazione");
}

function trackingDetails(order: any) {
  const metadata = Array.isArray(order?.meta_data) ? order.meta_data : [];
  const map = new Map(metadata.map((item: any) => [String(item?.key || ""), item?.value]));
  const shipmentItems = map.get("_wc_shipment_tracking_items");
  const first = Array.isArray(shipmentItems) ? shipmentItems[0] : undefined;
  const number = cleanLabel(first?.tracking_number || map.get("_tracking_number") || map.get("tracking_number"), "");
  const carrier = cleanLabel(first?.tracking_provider || first?.custom_tracking_provider || map.get("_tracking_provider"), "");
  const url = safeTrackingUrl(first?.custom_tracking_link || map.get("_tracking_link") || map.get("tracking_url"));
  return { number: number || undefined, carrier: carrier || undefined, url };
}

export function presentVerifiedWooOrder(order: any) {
  const number = cleanLabel(order?.number || order?.id, "—");
  const status = statusLabel(order?.status);
  const total = Number(order?.total);
  const currency = /^[A-Z]{3}$/.test(String(order?.currency || "")) ? String(order.currency) : undefined;
  const shipping = Array.isArray(order?.shipping_lines)
    ? order.shipping_lines.map((item: any) => cleanLabel(item?.method_title, "")).filter(Boolean).slice(0, 2).join(", ")
    : "";
  const tracking = trackingDetails(order);
  const lines = [`Ordine #${number}: **${status}**.`];
  if (Number.isFinite(total) && currency) lines.push(`Totale: ${new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(total)}.`);
  if (shipping) lines.push(`Spedizione: ${shipping}.`);
  if (tracking.carrier) lines.push(`Corriere: ${tracking.carrier}.`);
  if (tracking.number) lines.push(`Tracking: ${tracking.number}.`);
  if (tracking.url) lines.push(`Segui la spedizione: ${tracking.url}`);
  if (!tracking.number && !tracking.url && !["completed", "cancelled", "refunded"].includes(String(order?.status || ""))) {
    lines.push("Il link di tracciamento apparirà appena il negozio lo renderà disponibile.");
  }
  return lines.join("\n");
}
