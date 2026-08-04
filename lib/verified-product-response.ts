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

/**
 * Builds the customer-facing text from the same verified records used by the
 * visual product cards. This prevents a generic RAG source from replacing a
 * Shopify product with a collection link or an unrelated item.
 */
export function buildVerifiedProductResponse(cards: ProductCard[]) {
  const available = cards.filter((card) => card.availability === "in_stock" || card.availability === "preorder");
  const selected = (available.length > 0 ? available : cards).slice(0, 5);
  if (selected.length === 0) return "Non ho trovato prodotti verificati corrispondenti nel catalogo.";

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
    "Apri la scheda del prodotto che preferisci per vedere foto, taglie, colori e disponibilità aggiornate.",
  ].join("\n");
}
