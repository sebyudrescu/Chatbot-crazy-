import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const updateSchema = z.object({
  botId: z.string().uuid(),
  recommendationStatus: z.enum(["normal", "promoted", "excluded", "blocked"]).optional(),
  rankingBoost: z.number().int().min(-100).max(100).optional(),
  merchandisingNote: z.string().trim().max(500).nullable().optional(),
  campaignStart: z.string().datetime().nullable().optional(),
  campaignEnd: z.string().datetime().nullable().optional(),
  availableForSale: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ productId: string }> },
) {
  const { productId } = await props.params;
  const body = updateSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(productId).success || !body.success) {
    return NextResponse.json({ success: false, error: "Modifica prodotto non valida" }, { status: 400 });
  }
  const input = body.data;
  const campaignStart = input.campaignStart === undefined ? undefined : input.campaignStart ? new Date(input.campaignStart) : null;
  const campaignEnd = input.campaignEnd === undefined ? undefined : input.campaignEnd ? new Date(input.campaignEnd) : null;
  if (campaignStart && campaignEnd && campaignEnd < campaignStart) {
    return NextResponse.json({ success: false, error: "La campagna termina prima dell'inizio" }, { status: 400 });
  }
  const updated = await prisma.product.updateMany({
    where: { id: productId, botId: input.botId },
    data: {
      recommendationStatus: input.recommendationStatus,
      rankingBoost: input.rankingBoost,
      merchandisingNote: input.merchandisingNote,
      campaignStart,
      campaignEnd,
      availableForSale: input.availableForSale,
    },
  });
  if (!updated.count) {
    return NextResponse.json({ success: false, error: "Prodotto non trovato" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
