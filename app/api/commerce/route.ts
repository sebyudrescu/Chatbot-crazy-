import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  botId: z.string().uuid(),
  search: z.string().trim().max(200).optional(),
  recommendationStatus: z.enum(["normal", "promoted", "excluded", "blocked"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(20),
});

function jsonArray(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    botId: request.nextUrl.searchParams.get("botId"),
    search: request.nextUrl.searchParams.get("search") || undefined,
    recommendationStatus: request.nextUrl.searchParams.get("recommendationStatus") || undefined,
    page: request.nextUrl.searchParams.get("page") || undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Parametri catalogo non validi" }, { status: 400 });
  }
  const { botId, search, recommendationStatus, page, pageSize } = parsed.data;
  const where = {
    botId,
    status: "active",
    ...(recommendationStatus ? { recommendationStatus } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { brand: { contains: search, mode: "insensitive" as const } },
        { externalId: { contains: search, mode: "insensitive" as const } },
        { variants: { some: { sku: { contains: search, mode: "insensitive" as const } } } },
      ],
    } : {}),
  };
  const [products, filteredTotal, total, active, incomplete, sources, eventCounts] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        source: { select: { id: true, name: true, sourceType: true } },
        variants: { orderBy: { position: "asc" }, take: 12 },
      },
      orderBy: [{ recommendationStatus: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
    prisma.product.count({ where: { botId, status: "active" } }),
    prisma.product.count({ where: { botId, status: "active", availableForSale: true } }),
    prisma.product.count({ where: { botId, status: "active", OR: [{ mainImageUrl: null }, { description: "" }] } }),
    prisma.productSource.findMany({
      where: { botId },
      include: {
        _count: { select: { products: { where: { status: "active" } } } },
        syncJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.commerceEvent.groupBy({ where: { botId }, by: ["eventType"], _count: { _all: true } }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        total,
        active,
        incomplete,
        events: Object.fromEntries(eventCounts.map((item) => [item.eventType, item._count._all])),
      },
      sources,
      products: products.map((product) => ({
        ...product,
        categories: jsonArray(product.categories),
        tags: jsonArray(product.tags),
        imageUrls: jsonArray(product.imageUrls),
        metadata: undefined,
        variants: product.variants.map((variant) => ({
          ...variant,
          attributes: (() => { try { return JSON.parse(variant.attributes); } catch { return {}; } })(),
          metadata: undefined,
        })),
      })),
      pagination: {
        page,
        pageSize,
        total: filteredTotal,
        totalPages: Math.max(1, Math.ceil(filteredTotal / pageSize)),
      },
    },
  });
}
