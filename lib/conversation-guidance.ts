export type BusinessMode = "commerce" | "services" | "support" | "general";

export interface SuggestedReply {
  id: string;
  text: string;
  category?: "faq" | "product" | "support" | "general";
}

const COMMERCE_CONTEXT = /\b(e-?commerce|negozio|shop|shopify|woocommerce|catalogo|abbigliamento|moda|scarpe|accessori|prodotti?|ordini?|spedizioni?|resi?)\b/i;
const SERVICE_CONTEXT = /\b(servizi?|consulenz|preventiv|appuntament|agenzia|professionist|studio)\b/i;
const SUPPORT_CONTEXT = /\b(supporto|assistenza|help desk|ticket|problemi? tecnic)\b/i;
const PRODUCT_NOUN = /\b(prodott[oi]|articol[oi]|cap[oi]|abbigliamento|vestit[oi]|pantalon[ei]|jeans|shorts?|magli[ae]|t-?shirt|camici[ae]|giacch[ae]|cappott[oi]|felp[ae]|scarpe?|sneakers?|bors[ae]|accessori?|intimo|costum[ei]|uomo|donna|bambin[oi]|tagli[ae]|color[ei]|material[ei]|lino|cotone)\b/i;
const CATALOG_ACTION = /\b(mostrami|mostrarmi|mostrare|fammi vedere|far vedere|cosa avete|quali avete|avete|vendete|quali prodotti|consigliami|consigli|raccomand|prezzo|cost[oa]|disponibil|in stock|taglia disponibile|foto|immagine|link|scheda prodotto|comprare|acquistare|ordina)\b/i;

export function detectBusinessMode(input: string): BusinessMode {
  if (COMMERCE_CONTEXT.test(input)) return "commerce";
  if (SUPPORT_CONTEXT.test(input)) return "support";
  if (SERVICE_CONTEXT.test(input)) return "services";
  return "general";
}

export function requiresVerifiedCatalog(message: string, mode: BusinessMode): boolean {
  if (mode !== "commerce") return false;
  return PRODUCT_NOUN.test(message) && CATALOG_ACTION.test(message);
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

export function buildContextualQuickReplies(input: {
  mode: BusinessMode;
  userMessage: string;
  assistantMessage: string;
  productCount: number;
  catalogBlocked?: boolean;
}): SuggestedReply[] {
  const user = input.userMessage.toLowerCase();
  const assistant = input.assistantMessage.toLowerCase();

  if (input.catalogBlocked) {
    return [{ id: "catalog-human", text: "Vorrei parlare con una persona", category: "support" }];
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
