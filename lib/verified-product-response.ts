import type { CommerceIntent } from "./commerce-query";
import type { ProductCard } from "./commerce-types";

function formatPrice(card: ProductCard) {
  if (card.price === undefined) return "Prezzo disponibile nella scheda prodotto";
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: card.currency || "EUR",
    }).format(card.price);
  } catch {
    return `${card.price.toFixed(2)} ${card.currency || "EUR"}`;
  }
}

function sizeOption(card: ProductCard) {
  return card.options.find((option) => /^(taglia|size|numero)$/i.test(option.name));
}

function requestedOptions(card: ProductCard, userMessage: string) {
  if (/\b(tagli[ae]|size|numero)\b/i.test(userMessage)) return card.options.filter((option) => /^(taglia|size|numero)$/i.test(option.name));
  if (/\b(color[ei]|colour)\b/i.test(userMessage)) return card.options.filter((option) => /^(colore|color|colour)$/i.test(option.name));
  return card.options;
}

function pluralOptionName(name: string) {
  if (/^(taglia|size)$/i.test(name)) return "Taglie";
  if (/^numero$/i.test(name)) return "Numeri";
  if (/^(colore|color|colour)$/i.test(name)) return "Colori";
  return name;
}

/** Builds text exclusively from server-hydrated catalog records. */
export function buildVerifiedProductResponse(cards: ProductCard[], intent: CommerceIntent = "product_discovery", userMessage = "") {
  const available = cards.filter((card) => card.availability === "in_stock" || card.availability === "preorder");
  const selected = (available.length > 0 ? available : cards).slice(0, 5);
  if (selected.length === 0) return "Non ho trovato prodotti verificati corrispondenti nel catalogo.";

  if (intent === "variant_availability") {
    const card = selected[0];
    const options = requestedOptions(card, userMessage);
    if (options.length === 0 || options.every((option) => option.availableValues.length === 0)) {
      return `Per [${card.title}](${card.productUrl}) non risultano varianti verificate sufficienti per rispondere con precisione. Posso aiutarti a contattare il negozio senza inventare informazioni.`;
    }
    const optionLines = options.flatMap((option) => [
      option.availableValues.length ? `${pluralOptionName(option.name)} disponibili: **${option.availableValues.join(", ")}**.` : "",
      option.unavailableValues.length ? `${pluralOptionName(option.name)} non disponibili: ${option.unavailableValues.join(", ")}.` : "",
    ]).filter(Boolean);
    return [
      `Disponibilità verificata per [${card.title}](${card.productUrl}):`,
      ...optionLines,
      `Prezzo verificato: **${formatPrice(card)}**.`,
    ].filter(Boolean).join("\n\n");
  }

  if (intent === "fit_advice") {
    const card = selected[0];
    const sizes = sizeOption(card);
    return [
      "Non posso garantire al 100% la vestibilità o una data di consegna senza misure e verifica della spedizione.",
      sizes?.availableValues.length
        ? `Per [${card.title}](${card.productUrl}) risultano disponibili le taglie **${sizes.availableValues.join(", ")}**.`
        : `Per [${card.title}](${card.productUrl}) non ho una tabella taglie verificata sufficiente per consigliarti una misura precisa.`,
      "Per scegliere bene servono almeno girovita e vestibilità preferita; se vuoi, posso passarti a una persona del negozio.",
    ].join("\n\n");
  }

  if (intent === "product_detail") {
    const card = selected[0];
    const sizes = sizeOption(card);
    return [
      `**[${card.title}](${card.productUrl})**`,
      card.shortDescription || "Descrizione non disponibile.",
      `Prezzo verificato: **${formatPrice(card)}** — ${card.availability === "in_stock" ? "disponibile" : "disponibilità da verificare"}.`,
      sizes?.availableValues.length ? `Taglie disponibili: ${sizes.availableValues.join(", ")}.` : "",
    ].filter(Boolean).join("\n\n");
  }

  if (intent === "product_comparison") {
    return selected.slice(0, 2).map((card) => {
      const sizes = sizeOption(card);
      return `- **[${card.title}](${card.productUrl})** — ${formatPrice(card)} — ${card.availability === "in_stock" ? "disponibile" : "non disponibile"}${sizes?.availableValues.length ? ` — taglie: ${sizes.availableValues.join(", ")}` : ""}`;
    }).join("\n");
  }

  const introduction = selected.length === 1
    ? "Ho trovato questo prodotto verificato nel catalogo:"
    : `Ho trovato ${selected.length} prodotti verificati nel catalogo:`;
  const rows = selected.map((card) => {
    const availability = card.availability === "in_stock"
      ? "disponibile"
      : card.availability === "preorder"
        ? "preordinabile"
        : "disponibilità da verificare";
    return `- [${card.title}](${card.productUrl}) — ${formatPrice(card)} — ${availability}`;
  });

  return [
    introduction,
    "",
    ...rows,
    "",
    "Apri la scheda del prodotto che preferisci per vedere tutti i dettagli aggiornati.",
  ].join("\n");
}
