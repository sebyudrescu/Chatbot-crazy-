import "server-only";

import { prisma } from "./db";
import {
  productCardsSchema,
  productSelectionSchema,
  safeHttpsUrl,
  type ProductCard,
  type ProductSelection,
} from "./commerce-types";

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function availability(available: boolean, stockQuantity: number | null) {
  if (!available || stockQuantity === 0) return "out_of_stock" as const;
  return "in_stock" as const;
}

export async function hydrateProductCards(
  botId: string,
  rawSelections: ProductSelection[],
): Promise<ProductCard[]> {
  const selections = rawSelections
    .map((selection) => productSelectionSchema.safeParse(selection))
    .filter((result): result is { success: true; data: ProductSelection } => result.success)
    .map((result) => result.data)
    .slice(0, 5);

  if (selections.length === 0) return [];

  const products = await prisma.product.findMany({
    where: {
      botId,
      id: { in: selections.map((selection) => selection.productId) },
      status: "active",
    },
    include: { source: { select: { sourceType: true } }, variants: { orderBy: { position: "asc" } } },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  const cards = selections.flatMap((selection) => {
    const product = byId.get(selection.productId);
    if (!product) return [];
    const selectedVariant = selection.variantId
      ? product.variants.find((variant) => variant.id === selection.variantId)
      : product.variants.find((variant) => variant.available) ?? product.variants[0];
    if (selection.variantId && !selectedVariant) return [];

    const productUrl = safeHttpsUrl(selectedVariant?.productUrl) ?? safeHttpsUrl(product.canonicalUrl);
    if (!productUrl) return [];
    const imageUrl = safeHttpsUrl(selectedVariant?.imageUrl)
      ?? safeHttpsUrl(product.mainImageUrl)
      ?? parseStringArray(product.imageUrls).map(safeHttpsUrl).find(Boolean);
    const isAvailable = product.availableForSale && (selectedVariant?.available ?? true);
    const price = selectedVariant?.price ?? undefined;
    const compareAtPrice = selectedVariant?.compareAtPrice ?? undefined;
    const onSale = price !== undefined && compareAtPrice !== undefined && compareAtPrice > price;
    const commerceId = selectedVariant?.externalId?.split("/").pop() ?? product.externalId?.split("/").pop();
    const supportsCart = product.source?.sourceType === "shopify" || product.source?.sourceType === "woocommerce";
    const addToCartUrl = isAvailable && supportsCart && commerceId && /^\d+$/.test(commerceId)
      ? safeHttpsUrl(new URL(
          product.source?.sourceType === "shopify"
            ? `/cart/add?id=${encodeURIComponent(commerceId)}&quantity=1`
            : `/?add-to-cart=${encodeURIComponent(commerceId)}&quantity=1`,
          productUrl,
        ).toString())
      : undefined;

    return [{
      productId: product.id,
      variantId: selectedVariant?.id,
      title: product.title,
      shortDescription: product.description.slice(0, 500),
      imageUrl,
      productUrl,
      price,
      compareAtPrice,
      currency: selectedVariant?.currency?.toUpperCase(),
      availability: availability(isAvailable, selectedVariant?.stockQuantity ?? null),
      badge: onSale ? "In offerta" : undefined,
      reason: selection.reason,
      actions: [
        { type: "view" as const, label: "Vedi prodotto", url: productUrl },
        ...(addToCartUrl ? [{ type: "add_to_cart" as const, label: "Aggiungi al carrello", url: addToCartUrl, variantId: selectedVariant?.id }] : []),
      ],
    }];
  });

  return productCardsSchema.parse(cards);
}
