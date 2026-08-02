import { z } from "zod";

const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", {
  message: "Only HTTPS URLs are allowed",
});

export const productCardActionSchema = z.object({
  type: z.enum(["view", "compare", "add_to_cart"]),
  label: z.string().trim().min(1).max(80),
  url: httpsUrl.optional(),
  variantId: z.string().uuid().optional(),
});

export const productCardSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(240),
  shortDescription: z.string().trim().max(500).default(""),
  imageUrl: httpsUrl.optional(),
  productUrl: httpsUrl,
  price: z.number().nonnegative().optional(),
  compareAtPrice: z.number().nonnegative().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  availability: z.enum(["in_stock", "out_of_stock", "preorder", "unknown"]),
  badge: z.string().trim().max(40).optional(),
  reason: z.string().trim().max(300).default(""),
  actions: z.array(productCardActionSchema).max(3).default([]),
});

export const productCardsSchema = z.array(productCardSchema).max(5);

export const productSelectionSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  reason: z.string().trim().max(300).default(""),
});

export const pageContextSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().trim().max(300).optional(),
  referrer: z.string().url().max(2048).optional(),
  language: z.string().trim().max(35).optional(),
  productId: z.string().trim().max(200).optional(),
  sku: z.string().trim().max(200).optional(),
  utm: z.record(z.string().trim().max(300)).optional(),
  recentPages: z.array(z.object({
    url: z.string().url().max(2048),
    title: z.string().trim().max(300).optional(),
  })).max(8).optional(),
});

export type ProductCard = z.infer<typeof productCardSchema>;
export type ProductSelection = z.infer<typeof productSelectionSchema>;
export type PageContext = z.infer<typeof pageContextSchema>;

export function safeHttpsUrl(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = httpsUrl.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function pageContextMatchesOrigin(context: PageContext, requestOrigin: string | null) {
  if (!requestOrigin) return false;
  try {
    const page = new URL(context.url);
    const origin = new URL(requestOrigin);
    return page.protocol === "https:" && page.origin === origin.origin;
  } catch {
    return false;
  }
}
