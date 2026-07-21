import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readMetaClientLinkToken } from "@/lib/meta-client-link";
import { completeWhatsAppConnection } from "@/lib/meta-whatsapp-onboarding";

const Schema = z.object({
  token: z.string().min(20).max(2_048),
  code: z.string().min(8),
  wabaId: z.string().min(3),
  phoneNumberId: z.string().min(3),
  businessId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json());
    const link = readMetaClientLinkToken(input.token);
    if (link.provider !== "whatsapp") throw new Error("Questo link non è valido per WhatsApp");
    const data = await completeWhatsAppConnection({
      botId: link.botId,
      code: input.code,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      businessId: input.businessId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Collegamento WhatsApp non riuscito" },
      { status: 400 },
    );
  }
}
