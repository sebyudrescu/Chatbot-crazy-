import { z } from "zod";

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Only HTTPS URLs are allowed",
  });

export const productCardActionSchema = z.object({
  type: z.enum(["view", "compare", "add_to_cart"]),
  label: z.string().trim().min(1).max(80),
  url: httpsUrl.optional(),
  variantId: z.string().uuid().optional(),
});

export const productCardVariantSchema = z.object({
  variantId: z.string().uuid(),
  label: z.string().trim().min(1).max(160),
  choices: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(100),
      }),
    )
    .max(10)
    .default([]),
  price: z.number().nonnegative().optional(),
  compareAtPrice: z.number().nonnegative().optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  availability: z.enum(["in_stock", "out_of_stock", "preorder", "unknown"]),
  addToCartUrl: httpsUrl.optional(),
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
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  availability: z.enum(["in_stock", "out_of_stock", "preorder", "unknown"]),
  badge: z.string().trim().max(40).optional(),
  reason: z.string().trim().max(300).default(""),
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        availableValues: z.array(z.string().trim().min(1).max(100)).max(100),
        unavailableValues: z.array(z.string().trim().min(1).max(100)).max(100),
      }),
    )
    .max(10)
    .default([]),
  variants: z.array(productCardVariantSchema).max(100).default([]),
  actions: z.array(productCardActionSchema).max(3).default([]),
});

export const productCardsSchema = z.array(productCardSchema).max(5);

const orderHttpsUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Only HTTPS URLs are allowed",
  });

export const orderStatusCardSchema = z.object({
  version: z.literal(1),
  provider: z.literal("shopify"),
  storeName: z.string().trim().min(1).max(160),
  orderNumber: z.string().trim().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  estimatedDeliveryAt: z.string().datetime().optional(),
  status: z.object({
    code: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    tone: z.enum(["neutral", "info", "success", "warning", "danger"]),
  }),
  milestones: z
    .array(
      z.object({
        key: z.enum([
          "confirmed",
          "preparing",
          "shipped",
          "in_transit",
          "delivered",
        ]),
        label: z.string().trim().min(1).max(80),
        state: z.enum(["complete", "current", "pending", "attention"]),
      }),
    )
    .length(5),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(240),
        variantTitle: z.string().trim().max(160).optional(),
        quantity: z.number().int().positive().max(10_000),
        imageUrl: orderHttpsUrl.optional(),
      }),
    )
    .max(50),
  shipments: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        statusCode: z.string().trim().min(1).max(80),
        statusLabel: z.string().trim().min(1).max(120),
        estimatedDeliveryAt: z.string().datetime().optional(),
        updatedAt: z.string().datetime().optional(),
        tracking: z
          .array(
            z.object({
              carrier: z.string().trim().max(120).optional(),
              number: z.string().trim().max(160).optional(),
              url: orderHttpsUrl.optional(),
            }),
          )
          .max(10),
      }),
    )
    .max(20),
  actions: z
    .array(
      z.object({
        type: z.enum(["track", "order_status"]),
        label: z.string().trim().min(1).max(80),
        url: orderHttpsUrl,
      }),
    )
    .max(12),
});

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
  recentPages: z
    .array(
      z.object({
        url: z.string().url().max(2048),
        title: z.string().trim().max(300).optional(),
      }),
    )
    .max(8)
    .optional(),
});

export type ProductCard = z.infer<typeof productCardSchema>;
export type OrderStatusCard = z.infer<typeof orderStatusCardSchema>;
export type ProductSelection = z.infer<typeof productSelectionSchema>;
export type PageContext = z.infer<typeof pageContextSchema>;

export function safeHttpsUrl(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = httpsUrl.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function pageContextMatchesOrigin(
  context: PageContext,
  requestOrigin: string | null,
) {
  if (!requestOrigin) return false;
  try {
    const page = new URL(context.url);
    const origin = new URL(requestOrigin);
    return page.protocol === "https:" && page.origin === origin.origin;
  } catch {
    return false;
  }
}
