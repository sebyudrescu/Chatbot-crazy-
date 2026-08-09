export type BusinessMode = "commerce" | "services" | "support" | "general";

export interface SuggestedReply {
  id: string;
  text: string;
  category?: "faq" | "product" | "support" | "general";
}

import { classifyCommerceIntent, type CommerceIntent } from "./commerce-query";

const COMMERCE_CONTEXT = /\b(e-?commerce|negozio|shop|shopify|woocommerce|catalogo|abbigliamento|moda|scarpe|accessori|prodotti?|ordini?|spedizioni?|resi?)\b/i;
const SERVICE_CONTEXT = /\b(servizi?|consulenz|preventiv|appuntament|agenzia|professionist|studio)\b/i;
const SUPPORT_CONTEXT = /\b(supporto|assistenza|help desk|ticket|problemi? tecnic)\b/i;
export function detectBusinessMode(input: string): BusinessMode {
  if (COMMERCE_CONTEXT.test(input)) return "commerce";
  if (SUPPORT_CONTEXT.test(input)) return "support";
  if (SERVICE_CONTEXT.test(input)) return "services";
  return "general";
}

export function requiresVerifiedCatalog(message: string, mode: BusinessMode): boolean {
  return isVerifiedCatalogIntent(classifyCommerceIntent(message, mode === "commerce"));
}

export function isVerifiedCatalogIntent(intent: CommerceIntent): boolean {
  return ["product_discovery", "product_detail", "variant_availability", "product_comparison", "fit_advice"]
    .includes(intent);
}

export function buildInitialQuickReplies(mode: BusinessMode): SuggestedReply[] {
  if (mode === "commerce") {
    return [
      { id: "find-product", text: "Cerco un prodotto", category: "product" },
      { id: "track-order", text: "Voglio seguire un ordine", category: "support" },
      { id: "shipping-returns", text: "Spedizioni e resi", category: "faq" },
    ];
  }
  if (mode === "services") {
    return [
      { id: "services", text: "Quali servizi offrite?", category: "general" },
      { id: "contact", text: "Come posso contattarvi?", category: "support" },
      { id: "quote", text: "Vorrei un preventivo", category: "general" },
    ];
  }
  if (mode === "support") {
    return [
      { id: "support", text: "Ho bisogno di assistenza", category: "support" },
      { id: "human", text: "Vorrei parlare con una persona", category: "support" },
    ];
  }
  return [
    { id: "capabilities", text: "In cosa potete aiutarmi?", category: "general" },
    { id: "contact", text: "Come posso contattarvi?", category: "support" },
  ];
}

export function catalogUnavailableResponse(catalogSize: number): string {
  if (catalogSize === 0) {
    return "Al momento non ho un catalogo prodotti verificato collegato, quindi non posso mostrarti articoli, foto, prezzi o disponibilità senza rischiare di inventare. Posso passarti a una persona del team oppure puoi riprovare quando il catalogo sarà sincronizzato.";
  }
  return "Non ho trovato nel catalogo verificato prodotti che corrispondano a questa richiesta. Prova a indicarmi una categoria, un colore, un materiale o un budget diverso; in alternativa posso passarti a una persona del team.";
}

export function styleAdviceClarification() {
  return "Posso aiutarti a costruire un look, ma per consigliarti prodotti reali senza andare a caso mi serve un dettaglio in piÃ¹: cerchi un outfit per lavoro, cerimonia, serata o tutti i giorni? Dimmi anche una fascia di budget e ti mostro solo capi verificati del catalogo.";
}

export function buildContextualQuickReplies(input: {
  mode: BusinessMode;
  userMessage: string;
  assistantMessage: string;
  productCount: number;
  catalogBlocked?: boolean;
  commerceIntent?: CommerceIntent;
}): SuggestedReply[] {
  const user = input.userMessage.toLowerCase();
  const assistant = input.assistantMessage.toLowerCase();

  if (input.catalogBlocked) {
    return [{ id: "catalog-human", text: "Vorrei parlare con una persona", category: "support" }];
  }
  if (input.productCount > 0 && input.commerceIntent === "variant_availability") {
    return [
      { id: "product-other-size", text: "Controlla un'altra taglia", category: "product" },
      { id: "product-details", text: "Mostrami i dettagli del prodotto", category: "product" },
    ];
  }
  if (input.productCount > 0 && input.commerceIntent === "fit_advice") {
    return [
      { id: "product-size-help", text: "Aiutami con le misure", category: "product" },
      { id: "product-human", text: "Vorrei parlare con una persona", category: "support" },
    ];
  }
  if (input.productCount > 0) {
    return [
      { id: "product-alternatives", text: "Mostrami alternative simili", category: "product" },
      { id: "product-help", text: "Aiutami a scegliere", category: "product" },
    ];
  }
  if (input.mode === "commerce" && /bambin/.test(user) && /(non (abbiamo|include|dispon)|uomo e donna|uomo o donna)/.test(assistant)) {
    return [
      { id: "menswear", text: "Mostrami capi da uomo", category: "product" },
      { id: "womenswear", text: "Mostrami capi da donna", category: "product" },
    ];
  }
  if (/\b(ordine|spedizione|pacco|consegna)\b/.test(user)) {
    return [{ id: "track-order", text: "Voglio seguire un ordine", category: "support" }];
  }
  if (/\b(reso|rimborso|cambio)\b/.test(user)) {
    return [{ id: "returns-help", text: "Ho bisogno di assistenza sul reso", category: "support" }];
  }
  if (input.mode === "services" && /\b(prezzo|costo|preventivo)\b/.test(user + " " + assistant)) {
    return [
      { id: "quote", text: "Vorrei un preventivo", category: "general" },
      { id: "contact", text: "Come posso contattarvi?", category: "support" },
    ];
  }
  return [];
}
