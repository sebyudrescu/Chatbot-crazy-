"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Bot, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { safeHttpUrl } from "@/components/chat/SafeRichText";
import type { ProductCard } from "@/lib/commerce-types";

function productPrice(card: ProductCard) {
  if (card.price === undefined) return "Vedi prezzo";
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: card.currency || "EUR" }).format(card.price);
  } catch {
    return `${card.price.toFixed(2)} ${card.currency || "EUR"}`;
  }
}

function availabilityLabel(value: ProductCard["availability"]) {
  if (value === "in_stock") return "Disponibile";
  if (value === "out_of_stock") return "Esaurito";
  if (value === "preorder") return "Preordine";
  return "Verifica disponibilità";
}

export function ProductCarousel({ cards }: { cards?: ProductCard[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const validCards = useMemo(
    () => (cards || []).filter((card) => Boolean(safeHttpUrl(card.productUrl))).slice(0, 5),
    [cards],
  );

  const moveTo = useCallback((index: number) => {
    const viewport = viewportRef.current;
    if (!viewport || !validCards.length) return;
    const nextIndex = Math.max(0, Math.min(index, validCards.length - 1));
    const target = viewport.children.item(nextIndex) as HTMLElement | null;
    if (target) viewport.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    setActiveIndex(nextIndex);
  }, [validCards.length]);

  const syncActiveCard = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const children = Array.from(viewport.children) as HTMLElement[];
    if (!children.length) return;
    const nearest = children.reduce((best, child, index) => {
      const distance = Math.abs(child.offsetLeft - viewport.scrollLeft);
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Number.POSITIVE_INFINITY });
    setActiveIndex(nearest.index);
  }, []);

  if (!validCards.length) return null;

  return (
    <section className="relative mt-2 min-w-0" aria-roledescription="carosello" aria-label="Prodotti consigliati">
      <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Prodotti</p>
        {validCards.length > 1 ? <span className="text-[10px] tabular-nums text-gray-400" aria-live="polite">{activeIndex + 1} / {validCards.length}</span> : null}
      </div>
      <div className="relative">
        <div
          ref={viewportRef}
          onScroll={syncActiveCard}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); moveTo(activeIndex - 1); }
            if (event.key === "ArrowRight") { event.preventDefault(); moveTo(activeIndex + 1); }
          }}
          className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 pr-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          tabIndex={validCards.length > 1 ? 0 : -1}
        >
          {validCards.map((card, index) => {
            const href = safeHttpUrl(card.productUrl)!;
            const image = card.imageUrl ? safeHttpUrl(card.imageUrl) : null;
            return (
              <article key={`${card.productId}-${card.variantId || index}`} className="group w-[calc(100%-2.5rem)] min-w-[210px] max-w-[300px] shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-brand-200 hover:shadow-md" aria-label={`${index + 1} di ${validCards.length}: ${card.title}`}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="block">
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
                    {image ? (
                      // Product images come from verified HTTPS merchant catalog sources.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={card.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]" loading="lazy" />
                    ) : <div className="flex h-full items-center justify-center"><Bot className="h-7 w-7 text-gray-300" /></div>}
                    {card.badge ? <span className="absolute left-2.5 top-2.5 rounded-full bg-brand-600 px-2 py-1 text-[9px] font-bold text-white">{card.badge}</span> : null}
                  </div>
                  <div className="p-3.5">
                    <div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 text-[12px] font-semibold leading-4 text-gray-900">{card.title}</h3><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 transition group-hover:text-brand-600" aria-hidden="true" /></div>
                    {card.shortDescription ? <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-gray-500">{card.shortDescription}</p> : null}
                    <div className="mt-3 flex items-end justify-between gap-2"><span className="text-sm font-bold text-brand-700">{productPrice(card)}</span><span className={`text-[9px] font-semibold ${card.availability === "in_stock" ? "text-emerald-600" : card.availability === "out_of_stock" ? "text-red-600" : "text-amber-600"}`}>{availabilityLabel(card.availability)}</span></div>
                  </div>
                </a>
              </article>
            );
          })}
        </div>
        {validCards.length > 1 ? <><button type="button" onClick={() => moveTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="Prodotto precedente" className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:pointer-events-none disabled:opacity-0"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => moveTo(activeIndex + 1)} disabled={activeIndex === validCards.length - 1} aria-label="Prodotto successivo" className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:pointer-events-none disabled:opacity-0"><ChevronRight className="h-4 w-4" /></button></> : null}
      </div>
    </section>
  );
}
