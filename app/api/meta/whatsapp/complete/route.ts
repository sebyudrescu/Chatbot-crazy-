import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { completeWhatsAppConnection } from "@/lib/meta-whatsapp-onboarding";

const Schema = z.object({ botId: z.string().uuid(), code: z.string().min(8), wabaId: z.string().min(3), phoneNumberId: z.string().min(3), businessId: z.string().optional() });

export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json());
    const data = await completeWhatsAppConnection(input);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Collegamento WhatsApp non riuscito" }, { status: 400 });
  }
}
