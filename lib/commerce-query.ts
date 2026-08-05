export type CommerceIntent =
  | "none"
  | "product_discovery"
  | "product_detail"
  | "variant_availability"
  | "product_comparison"
  | "fit_advice"
  | "returns_policy"
  | "shipping_policy"
  | "order_tracking"
  | "prompt_injection";

export type ProductCategory =
  | "trousers"
  | "shorts"
  | "polo"
  | "shirt"
  | "top"
  | "jacket"
  | "coat"
  | "sweatshirt"
  | "dress"
  | "shoes"
  | "bag"
  | "accessory"
  | "swimwear";

export interface ParsedCommerceQuery {
  normalized: string;
  intent: CommerceIntent;
  category?: ProductCategory;
  excludedCategories: ProductCategory[];
  gender?: "men" | "women" | "children";
  colors: string[];
  materials: string[];
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  availableOnly: boolean;
  wantsCards: boolean;
  maxCards: number;
}

const PRODUCT_WORD = /\b(prodott[oi]|articol[oi]|cap[oi]|abbigliamento|vestit[oi]|pantalon(?:e|i|cin[oi])|jeans|shorts?|polo|magli[ae]|t-?shirt|camici[ae]|giacch[ae]|cappott[oi]|felp[ae]|scarp[ae]|sneakers?|bors[ae]|accessori?|intimo|costum[ei]|tagli[ae]|misur[ae]|color[ei]|variant[ei])\b/i;
const DISCOVERY_ACTION = /\b(mostrami|mostrarmi|mostrare|fammi vedere|far vedere|cosa avete|quali avete|avete|vendete|cerco|cercando|vorrei|voglio|volevo|desidero|mi serve|consigliami|consiglia|raccomand|alternative?|foto|immagin[ei]|link|comprare|acquistare)\b/i;
const DETAIL_ACTION = /\b(prezzo|cost[oa]|materiale|composizione|descrizione|dettagli[oi]|caratteristiche|scheda prodotto|disponibil)\b/i;
const VARIANT_ACTION = /\b(tagli[ae]|misur[ae]|variant[ei]|numero|color[ei])\b/i;

const CATEGORY_PATTERNS: Array<[ProductCategory, RegExp]> = [
  ["shorts", /\b(pantaloncin[oi]|shorts?|bermuda)\b/i],
  ["trousers", /\b(pantalon[ei]|jeans?)\b/i],
  ["polo", /\bpolo\b/i],
  ["shirt", /\b(camici[ae]|shirt|t-?shirt)\b/i],
  ["top", /\b(magli[ae]|top)\b/i],
  ["jacket", /\b(giacch[ae]|blazer)\b/i],
  ["coat", /\b(cappott[oi]|trench)\b/i],
  ["sweatshirt", /\b(felp[ae]|hoodie)\b/i],
  ["dress", /\b(abit[oi]|vestit[oi])\b/i],
  ["shoes", /\b(scarp[ae]|sneakers?|stival[ei]|sandali?)\b/i],
  ["bag", /\b(bors[ae]|zain[oi])\b/i],
  ["accessory", /\b(accessori?|caten[ae]|cintur[ae])\b/i],
  ["swimwear", /\b(costum[ei]|swimwear)\b/i],
];

const CATEGORY_MATCHERS: Record<ProductCategory, RegExp> = {
  trousers: /\b(pantalon[ei]|jeans?)\b/i,
  shorts: /\b(pantaloncin[oi]|shorts?|bermuda)\b/i,
  polo: /\bpolo\b/i,
  shirt: /\b(camici[ae]|shirt|t-?shirt)\b/i,
  top: /\b(magli[ae]|top)\b/i,
  jacket: /\b(giacch[ae]|blazer)\b/i,
  coat: /\b(cappott[oi]|trench)\b/i,
  sweatshirt: /\b(felp[ae]|hoodie)\b/i,
  dress: /\b(abit[oi]|vestit[oi])\b/i,
  shoes: /\b(scarp[ae]|sneakers?|stival[ei]|sandali?)\b/i,
  bag: /\b(bors[ae]|zain[oi])\b/i,
  accessory: /\b(accessori?|caten[ae]|cintur[ae])\b/i,
  swimwear: /\b(costum[ei]|swimwear)\b/i,
};

const COLOR_ALIASES: Record<string, string[]> = {
  nero: ["nero", "nera", "neri", "nere", "black"],
  bianco: ["bianco", "bianca", "bianchi", "bianche", "white"],
  blu: ["blu", "blue", "navy"],
  beige: ["beige", "sabbia"],
  grigio: ["grigio", "grigia", "grey", "gray"],
  verde: ["verde", "green"],
  rosso: ["rosso", "rossa", "red"],
  rosa: ["rosa", "pink"],
  marrone: ["marrone", "brown", "cuoio"],
};

const MATERIAL_ALIASES: Record<string, string[]> = {
  lino: ["lino", "linen"],
  cotone: ["cotone", "cotton"],
  lana: ["lana", "wool"],
  viscosa: ["viscosa", "viscose"],
  poliestere: ["poliestere", "polyester"],
  pelle: ["pelle", "leather"],
  denim: ["denim"],
};

export function normalizeCommerceText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9€]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseAmount(value: string) {
  const parsed = Number(value.replace(".", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function priceBounds(message: string) {
  const max = message.match(/(?:sotto|entro|massimo|max|meno di|under|up to)\s*(?:€|eur|euro)?\s*([0-9.,]+)/i);
  const min = message.match(/(?:sopra|oltre|almeno|minimo|min|more than|over)\s*(?:€|eur|euro)?\s*([0-9.,]+)/i);
  const range = message.match(/(?:tra|between)\s*(?:€|eur|euro)?\s*([0-9.,]+)\s*(?:e|a|and|-)\s*(?:€|eur|euro)?\s*([0-9.,]+)/i);
  return {
    min: range ? parseAmount(range[1]) : min ? parseAmount(min[1]) : undefined,
    max: range ? parseAmount(range[2]) : max ? parseAmount(max[1]) : undefined,
  };
}

export function classifyCommerceIntent(message: string, commerceMode = true): CommerceIntent {
  if (!commerceMode) return "none";
  const value = normalizeCommerceText(message);
  if (/\b(ignora|bypassa|dimentica)\b.*\b(istruzioni|regole|prompt)\b|\b(prompt di sistema|system prompt)\b|\binventa\b.*\b(prodott|prezz)/i.test(value)) return "prompt_injection";
  if (/\b(dove|traccia|tracking|stato)\b.*\b(ordine|pacco|spedizione)\b|\b(ordine|pacco)\b.*\b(dove|traccia|tracking|stato)\b/i.test(value)) return "order_tracking";
  if (/\b(res[oi]|restitu\w*|rimbors\w*|cambio merce|diritto di recesso)\b/i.test(value)) return "returns_policy";
  if (/\b(spedizion\w*|consegn\w*|arriv\w*|corriere|tempi di consegna)\b/i.test(value)) return "shipping_policy";
  if (/\b(garantis\w*|stara bene|vestira|vestibilita|che taglia devo|taglia consigli\w*|altezza|peso)\b/i.test(value)) return "fit_advice";
  if (/\b(confronta|paragona|differenz[ae]|meglio tra|quale dei due)\b/i.test(value)) return "product_comparison";
  if (VARIANT_ACTION.test(value) && PRODUCT_WORD.test(value)) return "variant_availability";
  if (DISCOVERY_ACTION.test(value) && PRODUCT_WORD.test(value)) return "product_discovery";
  if (DETAIL_ACTION.test(value) && PRODUCT_WORD.test(value)) return "product_detail";
  return "none";
}

function categoriesIn(value: string) {
  return CATEGORY_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([category]) => category);
}

function primaryCategory(value: string) {
  const exclusive = value.match(/\b(?:solo|soltanto|esclusivamente)\s+([a-z0-9 ]{1,40})/i)?.[1] || "";
  const requestedClause = value.split(/\b(?:da abbinare|da mettere|insieme a|con cui abbinare)\b/i)[0];
  return categoriesIn(exclusive)[0] ?? categoriesIn(requestedClause)[0];
}

function requestedAttributeScope(value: string) {
  const beforeIncidental = value.split(/\b(?:da abbinare|da mettere|insieme a|con cui abbinare)\b/i)[0];
  const exclusive = value.match(/\b(?:solo|soltanto|esclusivamente)\s+([a-z0-9 ]{1,80})/i)?.[1] || "";
  return `${beforeIncidental} ${exclusive}`.trim();
}

function excludedCategories(value: string) {
  const chunks = [...value.matchAll(/\b(?:non|senza)\s+(?:mostrarmi|mostrare|propormi|proporre|voglio|includere)?\s*([^.;!?]+)/gi)];
  return [...new Set(chunks.flatMap((match) => categoriesIn(match[1])))];
}

function aliasesIn(value: string, aliases: Record<string, string[]>) {
  return Object.entries(aliases).filter(([, forms]) => forms.some((form) => new RegExp(`\\b${form}\\b`, "i").test(value))).map(([canonical]) => canonical);
}

export function parseCommerceQuery(message: string, commerceMode = true): ParsedCommerceQuery {
  const normalized = normalizeCommerceText(message);
  const attributeScope = requestedAttributeScope(normalized);
  const intent = classifyCommerceIntent(message, commerceMode);
  const bounds = priceBounds(message);
  const sizeMatch = normalized.match(/\b(?:taglia|numero|size)\s*([0-9]{1,3}|xxs|xs|s|m|l|xl|xxl|xxxl)\b/i);
  const explicitlyRequestsPresentation = /\b(foto|immagin[ei]|link|scheda prodotto)\b/i.test(normalized);
  const wantsCards = intent === "product_discovery" || intent === "product_comparison" || explicitlyRequestsPresentation;
  return {
    normalized,
    intent,
    category: primaryCategory(normalized),
    excludedCategories: excludedCategories(normalized),
    gender: /\b(bambin[oi]|junior|kids?)\b/i.test(attributeScope) ? "children" : /\b(donna|women|woman|femminile)\b/i.test(attributeScope) ? "women" : /\b(uomo|men|man|maschile)\b/i.test(attributeScope) ? "men" : undefined,
    colors: aliasesIn(attributeScope, COLOR_ALIASES),
    materials: aliasesIn(attributeScope, MATERIAL_ALIASES),
    size: sizeMatch?.[1]?.toUpperCase(),
    minPrice: bounds.min,
    maxPrice: bounds.max,
    availableOnly: /\b(solo\s+)?disponibil|\bin stock\b|\bpronta consegna\b/i.test(normalized),
    wantsCards,
    maxCards: intent === "product_comparison" ? 2 : intent === "product_discovery" ? 5 : explicitlyRequestsPresentation ? 1 : 0,
  };
}

export function categoryMatches(category: ProductCategory, structuredText: string) {
  return CATEGORY_MATCHERS[category].test(normalizeCommerceText(structuredText));
}

export function categoryConflicts(category: ProductCategory, structuredText: string) {
  const value = normalizeCommerceText(structuredText);
  if (category === "trousers") return CATEGORY_MATCHERS.shorts.test(value) || CATEGORY_MATCHERS.accessory.test(value);
  if (category === "shorts") return CATEGORY_MATCHERS.trousers.test(value) && !CATEGORY_MATCHERS.shorts.test(value);
  return false;
}

export function aliasMatches(canonical: string, text: string, aliases: Record<string, string[]>) {
  const value = normalizeCommerceText(text);
  return (aliases[canonical] || [canonical]).some((form) => new RegExp(`\\b${form}\\b`, "i").test(value));
}

export function colorMatches(color: string, text: string) {
  return aliasMatches(color, text, COLOR_ALIASES);
}

export function materialMatches(material: string, text: string) {
  return aliasMatches(material, text, MATERIAL_ALIASES);
}

export interface CommerceCandidateFacts {
  structuredText: string;
  descriptiveText: string;
  availableForSale: boolean;
  availablePrices: number[];
  availableOptionValues: string[];
}

export function matchesCommerceConstraints(query: ParsedCommerceQuery, candidate: CommerceCandidateFacts) {
  const structured = normalizeCommerceText(candidate.structuredText);
  const descriptive = normalizeCommerceText(candidate.descriptiveText);
  if (query.category && (!categoryMatches(query.category, structured) || categoryConflicts(query.category, structured))) return false;
  if (query.excludedCategories.some((category) => categoryMatches(category, structured))) return false;
  if (query.gender) {
    const men = /\b(uomo|men|man|maschile)\b/i.test(structured);
    const women = /\b(donna|women|woman|femminile)\b/i.test(structured);
    const children = /\b(bambin[oi]|junior|kids?)\b/i.test(structured);
    if (query.gender === "children" && !children) return false;
    if (query.gender === "men" && women && !men) return false;
    if (query.gender === "women" && men && !women) return false;
  }
  if (query.colors.some((color) => !colorMatches(color, structured))) return false;
  if (query.materials.some((material) => !materialMatches(material, descriptive))) return false;
  if ((query.availableOnly || query.intent === "product_discovery") && !candidate.availableForSale) return false;
  if ((query.minPrice !== undefined || query.maxPrice !== undefined) && !candidate.availablePrices.some((price) =>
    (query.minPrice === undefined || price >= query.minPrice) && (query.maxPrice === undefined || price <= query.maxPrice))) return false;
  if (query.size && !candidate.availableOptionValues.some((value) => normalizeCommerceText(value) === normalizeCommerceText(query.size!))) return false;
  return true;
}
