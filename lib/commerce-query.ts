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

const PRODUCT_WORD = /\b(prodott[oi]|articol[oi]|cap[oi]|abbigliamento|vestit[oi]|pantalon(?:e|i|cin[oi])|jeans|shorts?|polo|magli[ae]|magliett[ae]|t[\s-]?shirt|camici[ae]|giacch[ae]|cappott[oi]|felp[ae]|scarp[ae]|sneakers?|bors[ae]|zain[oi]|accessori?|intimo|costum[ei]|design\w*|tagli[ae]|misur[ae]|color[ei]|variant[ei])\b/i;
const DISCOVERY_ACTION = /\b(mostrami|mostrarmi|mostrare|fammi vedere|far vedere|dammi|cosa avete|quali avete|avete|vendete|cerco|cercando|vorrei|voglio|volevo|desidero|mi serve|consigliami|consiglia|raccomand|alternative?|foto|immagin[ei]|link|card|schede?|comprare|acquistare)\b/i;
const DETAIL_ACTION = /\b(prezzo|cost[oa]|materiale|composizione|descrizione|dettagli[oi]|caratteristiche|scheda prodotto|disponibil)\b/i;
const VARIANT_ACTION = /\b(tagli[ae]|misur[ae]|variant[ei]|numero|color[ei])\b/i;
const GENERIC_STYLE_ADVICE = /\b(look|outfit|vestirmi|vestire|elegante|casual|cerimonia|matrimonio|serata)\b/i;
const EXPLICIT_PRODUCT_BROWSE = /\b(mostrami|mostrarmi|mostrare|fammi vedere|far vedere|foto|immagin[ei]|card|schede?|catalogo completo|tutti i modelli)\b/i;
const STYLE_PREFERENCE = /\b(elegant\w*|casual|cerimoni\w*|matrimoni\w*|serat\w*|lavoro|sportiv\w*|streetwear|formal\w*)\b/i;
const GENERIC_RECOMMENDATION = /\b(?:cosa|che cosa|qualcosa)\s+mi\s+consigli\b|\b(?:mi\s+)?consigli(?:ami|eresti)?\b/i;
const MERCHANT_AVAILABILITY = /\b(?:avete|hai|vendete|trattate|disponete di)\b/i;

const CATEGORY_PATTERNS: Array<[ProductCategory, RegExp]> = [
  ["shorts", /\b(pantaloncin[oi]|shorts?|bermuda)\b/i],
  ["trousers", /\b(pantalon[ei]|jeans?)\b/i],
  ["polo", /\bpolo\b/i],
  ["shirt", /\b(camici[ae]|magliett[ae]|shirt|t[\s-]?shirt)\b/i],
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

const CATEGORY_TERMS: Record<ProductCategory, string[]> = {
  trousers: ["pantalone", "pantaloni", "jeans"],
  shorts: ["pantaloncino", "pantaloncini", "short", "shorts", "bermuda"],
  polo: ["polo"],
  shirt: ["camicia", "camicie", "maglietta", "magliette", "shirt", "tshirt"],
  top: ["maglia", "maglie", "top"],
  jacket: ["giacca", "giacche", "blazer"],
  coat: ["cappotto", "cappotti", "trench"],
  sweatshirt: ["felpa", "felpe", "hoodie"],
  dress: ["abito", "abiti", "vestito", "vestiti"],
  shoes: ["scarpa", "scarpe", "sneaker", "sneakers", "stivale", "stivali", "sandalo", "sandali"],
  bag: ["borsa", "borse", "zaino", "zaini"],
  accessory: ["accessorio", "accessori", "catena", "catene", "cintura", "cinture"],
  swimwear: ["costume", "costumi", "swimwear"],
};

const CATEGORY_MATCHERS: Record<ProductCategory, RegExp> = {
  trousers: /\b(pantalon[ei]|jeans?)\b/i,
  shorts: /\b(pantaloncin[oi]|shorts?|bermuda)\b/i,
  polo: /\bpolo\b/i,
  shirt: /\b(camici[ae]|magliett[ae]|shirt|t[\s-]?shirt)\b/i,
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
  if (/\b(confronta|paragona|differenz[ae]|meglio tra|quale dei due)\b/i.test(value)) return "product_comparison";
  if (VARIANT_ACTION.test(value) && PRODUCT_WORD.test(value)) return "variant_availability";
  if (/\b(garantis\w*|stara bene|vestira|vestibilita|che taglia devo|taglia consigli\w*|altezza|peso)\b/i.test(value) || GENERIC_STYLE_ADVICE.test(value)) return "fit_advice";
  if (GENERIC_RECOMMENDATION.test(value)) return "product_discovery";
  if (MERCHANT_AVAILABILITY.test(value) && !/\b(servizi?|assistenza|supporto|orari?|pagament[oi])\b/i.test(value)) return "product_discovery";
  if (categoriesIn(value).length > 0 && (value.split(/\s+/).length <= 12 || /\b(?:che|quali|cosa|cerco|vorrei|voglio|volevo|mostra|consiglia)\b/i.test(value))) return "product_discovery";
  if (DISCOVERY_ACTION.test(value) && PRODUCT_WORD.test(value)) return "product_discovery";
  if (DETAIL_ACTION.test(value) && PRODUCT_WORD.test(value)) return "product_detail";
  return "none";
}

export function isGenericStyleAdviceRequest(message: string) {
  const normalized = normalizeCommerceText(message);
  return GENERIC_STYLE_ADVICE.test(normalized) && categoriesIn(normalized).length === 0;
}

/**
 * A bare availability question needs discovery before a recommendation.
 * Explicit browse requests and sufficiently constrained requests still go
 * straight to verified products.
 */
export function needsProductDiscoveryClarification(message: string, query = parseCommerceQuery(message)) {
  if (query.intent !== "product_discovery") return false;
  const normalized = normalizeCommerceText(message);
  if (EXPLICIT_PRODUCT_BROWSE.test(normalized)) return false;
  if (query.colors.length || query.materials.length || query.size || query.minPrice !== undefined || query.maxPrice !== undefined || query.availableOnly) return false;
  if (query.gender && STYLE_PREFERENCE.test(normalized)) return false;
  return Boolean(query.category) || /\bdesign\w*\b/i.test(normalized) || GENERIC_RECOMMENDATION.test(normalized);
}

/**
 * Carries product constraints across short natural follow-ups without turning
 * the whole conversation into a search query. The most recent verified
 * commerce turn is the only inherited context, so a new product request starts
 * a clean topic while replies such as "neri", "da uomo" or "sotto 80 euro"
 * retain the category the customer was already discussing.
 */
export function buildConversationalCommerceQuery(
  message: string,
  previousUserMessages: string[],
  commerceMode = true,
) {
  if (!commerceMode) return message;
  const current = normalizeCommerceText(message);
  const currentIntent = classifyCommerceIntent(message, commerceMode);
  const currentCategory = primaryCategory(current);
  const isShortFollowUp = current.split(/\s+/).filter(Boolean).length <= 10;
  const hasRefinement = Boolean(
    aliasesIn(current, COLOR_ALIASES).length ||
      aliasesIn(current, MATERIAL_ALIASES).length ||
      /\b(?:uomo|donna|bambin[oi]|men|women|kids?|taglia|size|numero|sotto|entro|massimo|budget|disponibil|elegant\w*|casual|sportiv\w*|lavoro|cerimoni\w*|matrimoni\w*|serat\w*)\b/i.test(current),
  );
  const refersBack = /\b(?:quelli?|quelle?|quest[oi]|queste|altro|altri|altre|simili|invece)\b/i.test(current);
  const genericRecommendation = GENERIC_RECOMMENDATION.test(current);

  // A complete, newly categorised request must not inherit stale constraints.
  if (currentCategory && currentIntent !== "none") return message;
  if (!isShortFollowUp || (!hasRefinement && !refersBack && !genericRecommendation && currentIntent !== "variant_availability")) return message;

  for (let index = previousUserMessages.length - 1; index >= 0; index -= 1) {
    const previous = previousUserMessages[index];
    const previousIntent = classifyCommerceIntent(previous, commerceMode);
    if (!isVerifiedCommerceConversationIntent(previousIntent)) continue;
    if (!primaryCategory(normalizeCommerceText(previous)) && previousIntent !== "product_detail") continue;
    const refinements = previousUserMessages.slice(index + 1).filter((candidate) => {
      const value = normalizeCommerceText(candidate);
      return value.split(/\s+/).length <= 10 && Boolean(
        aliasesIn(value, COLOR_ALIASES).length ||
          aliasesIn(value, MATERIAL_ALIASES).length ||
          /\b(?:uomo|donna|bambin[oi]|men|women|kids?|taglia|size|numero|sotto|entro|massimo|budget|disponibil|elegant\w*|casual|sportiv\w*|lavoro|cerimoni\w*|matrimoni\w*|serat\w*)\b/i.test(value),
      );
    });
    return [previous.trim(), ...refinements.map((item) => item.trim()), message.trim()].join(" ");
  }
  return message;
}

function isVerifiedCommerceConversationIntent(intent: CommerceIntent) {
  return ["product_discovery", "product_detail", "variant_availability", "product_comparison", "fit_advice"].includes(intent);
}

/**
 * A follow-up such as "cerca nel catalogo" is not meaningful on its own,
 * but it must keep the product category from the immediately relevant user
 * request. Otherwise it can fall through to RAG and surface an unverified
 * collection/crawler page instead of the connected commerce catalogue.
 */
export function buildCatalogFollowUpQuery(
  message: string,
  previousUserMessages: string[],
  commerceMode = true,
) {
  if (!commerceMode || classifyCommerceIntent(message, commerceMode) !== "none") return undefined;
  const normalized = normalizeCommerceText(message);
  if (!/\b(?:cerca|cercate|controlla|verifica|guard[ae])\b.*\bcatalog\w*\b/i.test(normalized)) return undefined;

  for (const previous of [...previousUserMessages].reverse()) {
    if (parseCommerceQuery(previous, commerceMode).category) {
      return `${previous.trim()} ${message.trim()}`;
    }
  }
  return undefined;
}

function editDistance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  for (let column = 1; column <= right.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      if (
        row > 1 && column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        rows[row][column] = Math.min(rows[row][column], rows[row - 2][column - 2] + 1);
      }
    }
  }
  return rows[left.length][right.length];
}

function categoriesIn(value: string) {
  const exact = CATEGORY_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([category]) => category);
  if (exact.length > 0) return exact;
  const words = value.split(/\s+/).filter((word) => word.length >= 5);
  return (Object.entries(CATEGORY_TERMS) as Array<[ProductCategory, string[]]>)
    .filter(([, terms]) => words.some((word) => terms.some((term) => term.length >= 5 && editDistance(word, term) <= (term.length >= 8 ? 2 : 1))))
    .map(([category]) => category);
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
  const explicitlyRequestsPresentation = /\b(foto|immagin[ei]|link|card|schede?|scheda prodotto)\b/i.test(normalized);
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
    maxCards: intent === "product_comparison" ? 2 : intent === "product_discovery" || explicitlyRequestsPresentation ? 5 : 0,
  };
}

export function structuredCommerceSearchTerms(query: ParsedCommerceQuery) {
  return [
    ...(query.category ? CATEGORY_TERMS[query.category] : []),
    ...query.colors.flatMap((color) => COLOR_ALIASES[color] || [color]),
    ...query.materials.flatMap((material) => MATERIAL_ALIASES[material] || [material]),
  ].map(normalizeCommerceText).filter(Boolean);
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
