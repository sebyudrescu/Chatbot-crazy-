"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShoppingBag,
} from "lucide-react";
import { safeHttpUrl } from "@/components/chat/SafeRichText";
import type { ProductCard } from "@/lib/commerce-types";

function productPrice(price: number | undefined, currency: string | undefined) {
  if (price === undefined) return "Vedi prezzo";
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: currency || "EUR",
    }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency || "EUR"}`;
  }
}

function variantSelectorLabel(variants: ProductCard["variants"]) {
  const names = new Set(
    variants.flatMap((variant) => variant.choices.map((choice) => choice.name)),
  );
  return names.size === 1 ? [...names][0] : "Variante";
}

function variantOptionLabel(variant: ProductCard["variants"][number]) {
  return variant.choices.length
    ? variant.choices.map((choice) => choice.value).join(" / ")
    : variant.label;
}

function availabilityLabel(value: ProductCard["availability"]) {
  if (value === "in_stock") return "Disponibile";
  if (value === "out_of_stock") return "Esaurito";
  if (value === "preorder") return "Preordine";
  return "Verifica disponibilità";
}

export function ProductCarousel({
  cards,
  presentation,
}: {
  cards?: ProductCard[];
  presentation?: { title?: string; description?: string; label?: string };
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cartStatus, setCartStatus] = useState<
    Record<string, "adding" | "added" | "error">
  >({});
  const [selectedVariantIds, setSelectedVariantIds] = useState<
    Record<string, string>
  >({});
  const validCards = useMemo(
    () =>
      (cards || [])
        .filter((card) => Boolean(safeHttpUrl(card.productUrl)))
        .slice(0, 5),
    [cards],
  );

  const moveTo = useCallback(
    (index: number) => {
      const viewport = viewportRef.current;
      if (!viewport || !validCards.length) return;
      const nextIndex = Math.max(0, Math.min(index, validCards.length - 1));
      const target = viewport.children.item(nextIndex) as HTMLElement | null;
      if (target)
        viewport.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
      setActiveIndex(nextIndex);
    },
    [validCards.length],
  );

  const syncActiveCard = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const children = Array.from(viewport.children) as HTMLElement[];
    if (!children.length) return;
    const nearest = children.reduce(
      (best, child, index) => {
        const distance = Math.abs(child.offsetLeft - viewport.scrollLeft);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    );
    setActiveIndex(nearest.index);
  }, []);

  const addToCart = useCallback(
    async (card: ProductCard, actionUrl: string, variantId?: string) => {
      if (typeof window === "undefined") return;
      const key = `${card.productId}:${variantId || card.variantId || "default"}`;
      setCartStatus((current) => ({ ...current, [key]: "adding" }));
      try {
        const url = new URL(actionUrl);
        const commerceVariantId = url.searchParams.get("id");
        const isCurrentShop =
          url.origin === window.location.origin &&
          /^\/cart\/add\/?$/i.test(url.pathname) &&
          /^\d+$/.test(commerceVariantId || "");
        if (!isCurrentShop) {
          window.open(url.toString(), "_blank", "noopener,noreferrer");
          setCartStatus((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          });
          return;
        }
        const response = await fetch("/cart/add.js", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            items: [{ id: Number(commerceVariantId), quantity: 1 }],
          }),
        });
        if (!response.ok) throw new Error("cart_add_failed");
        const cart = await fetch("/cart.js", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        })
          .then((result) => (result.ok ? result.json() : null))
          .catch(() => null);
        window.dispatchEvent(
          new CustomEvent("litx:cart:updated", {
            detail: {
              source: "litx-chat",
              productId: card.productId,
              variantId: variantId || card.variantId,
              itemCount: Number(cart?.item_count) || undefined,
            },
          }),
        );
        setCartStatus((current) => ({ ...current, [key]: "added" }));
      } catch {
        setCartStatus((current) => ({ ...current, [key]: "error" }));
      }
    },
    [],
  );

  if (!validCards.length) return null;

  return (
    <section
      className="relative mt-2 min-w-0"
      aria-roledescription="carosello"
      aria-label="Prodotti consigliati"
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
          {presentation?.title || "Prodotti"}
        </p>
        {validCards.length > 1 ? (
          <span
            className="text-[10px] tabular-nums text-gray-400"
            aria-live="polite"
          >
            {activeIndex + 1} / {validCards.length}
          </span>
        ) : null}
      </div>
      {presentation?.description ? (
        <p className="mb-2 px-0.5 text-[10px] leading-4 text-gray-500">
          {presentation.description}
        </p>
      ) : null}
      <div className="relative">
        <div
          ref={viewportRef}
          onScroll={syncActiveCard}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveTo(activeIndex - 1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveTo(activeIndex + 1);
            }
          }}
          className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 pr-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          tabIndex={validCards.length > 1 ? 0 : -1}
        >
          {validCards.map((card, index) => {
            const href = safeHttpUrl(card.productUrl)!;
            const image = card.imageUrl ? safeHttpUrl(card.imageUrl) : null;
            const cartAction = card.actions.find(
              (item) => item.type === "add_to_cart" && item.url,
            );
            const selectedVariant =
              card.variants.find(
                (variant) =>
                  variant.variantId === selectedVariantIds[card.productId],
              ) ??
              card.variants.find(
                (variant) => variant.variantId === card.variantId,
              ) ??
              card.variants.find(
                (variant) => variant.availability !== "out_of_stock",
              ) ??
              card.variants[0];
            const selectedCartUrl = selectedVariant
              ? selectedVariant.addToCartUrl
                ? safeHttpUrl(selectedVariant.addToCartUrl)
                : null
              : cartAction?.url
                ? safeHttpUrl(cartAction.url)
                : null;
            const selectedVariantId =
              selectedVariant?.variantId ?? card.variantId;
            const displayPrice = selectedVariant?.price ?? card.price;
            const displayCurrency = selectedVariant?.currency ?? card.currency;
            const displayAvailability =
              selectedVariant?.availability ?? card.availability;
            const cartKey = `${card.productId}:${selectedVariantId || "default"}`;
            const status = cartStatus[cartKey];
            const canAddInPlace =
              typeof window !== "undefined" && selectedCartUrl
                ? (() => {
                    const url = new URL(selectedCartUrl);
                    return (
                      url.origin === window.location.origin &&
                      /^\/cart\/add\/?$/i.test(url.pathname)
                    );
                  })()
                : false;
            return (
              <article
                key={`${card.productId}-${card.variantId || index}`}
                className="group w-[calc(100%-2.5rem)] min-w-[210px] max-w-[300px] shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-brand-200 hover:shadow-md"
                aria-label={`${index + 1} di ${validCards.length}: ${card.title}`}
              >
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
                    {image ? (
                      // Product images come from verified HTTPS merchant catalog sources.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image}
                        alt={card.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Bot className="h-7 w-7 text-gray-300" />
                      </div>
                    )}
                    {card.badge ? (
                      <span className="absolute left-2.5 top-2.5 rounded-full bg-brand-600 px-2 py-1 text-[9px] font-bold text-white">
                        {card.badge}
                      </span>
                    ) : null}
                  </div>
                </a>
                <div className="p-3.5">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-2"
                  >
                    <h3 className="line-clamp-2 text-[12px] font-semibold leading-4 text-gray-900">
                      {card.title}
                    </h3>
                    <ExternalLink
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 transition group-hover:text-brand-600"
                      aria-hidden="true"
                    />
                  </a>
                  {card.shortDescription ? (
                    <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-gray-500">
                      {card.shortDescription}
                    </p>
                  ) : null}
                  {card.reason ? (
                    <div className="mt-2 rounded-lg bg-brand-50 px-2.5 py-2 text-[10px] leading-4 text-gray-600">
                      <span className="block text-[9px] font-bold text-brand-800">
                        Perché è adatto a te
                      </span>
                      {card.reason}
                    </div>
                  ) : null}
                  {card.variants.length ? (
                    <label className="mt-3 block text-[9px] font-semibold text-gray-600">
                      {variantSelectorLabel(card.variants)}
                      <select
                        className="mt-1 min-h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-[10px] text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        value={selectedVariant?.variantId || ""}
                        onChange={(event) =>
                          setSelectedVariantIds((current) => ({
                            ...current,
                            [card.productId]: event.target.value,
                          }))
                        }
                      >
                        {card.variants.map((variant) => (
                          <option
                            key={variant.variantId}
                            value={variant.variantId}
                            disabled={variant.availability === "out_of_stock"}
                          >
                            {variantOptionLabel(variant)}
                            {variant.availability === "out_of_stock"
                              ? " — Esaurito"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <span className="text-sm font-bold text-brand-700">
                      {productPrice(displayPrice, displayCurrency)}
                    </span>
                    <span
                      className={`text-[9px] font-semibold ${displayAvailability === "in_stock" ? "text-emerald-600" : displayAvailability === "out_of_stock" ? "text-red-600" : "text-amber-600"}`}
                    >
                      {availabilityLabel(displayAvailability)}
                    </span>
                  </div>
                  {selectedCartUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        void addToCart(card, selectedCartUrl, selectedVariantId)
                      }
                      disabled={
                        status === "adding" ||
                        displayAvailability === "out_of_stock"
                      }
                      className="mt-3 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[10px] font-bold text-white transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {status === "added" ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Aggiunto al carrello
                        </>
                      ) : status === "error" ? (
                        "Riprova"
                      ) : (
                        <>
                          <ShoppingBag className="h-3.5 w-3.5" />
                          {status === "adding"
                            ? "Aggiunta in corso…"
                            : canAddInPlace
                              ? presentation?.label || "Aggiungi al carrello"
                              : "Apri nel negozio"}
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        {validCards.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => moveTo(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label="Prodotto precedente"
              className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => moveTo(activeIndex + 1)}
              disabled={activeIndex === validCards.length - 1}
              aria-label="Prodotto successivo"
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
