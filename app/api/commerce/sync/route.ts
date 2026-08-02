import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncCommercePlatform } from "@/lib/commerce-platform-sync";

const schema = z.object({ botId: z.string().uuid(), provider: z.enum(["shopify", "woocommerce"]) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Richiesta sync non valida" }, { status: 400 });
  try {
    const result = await syncCommercePlatform(parsed.data.botId, parsed.data.provider);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Sincronizzazione fallita" }, { status: 400 });
  }
}
