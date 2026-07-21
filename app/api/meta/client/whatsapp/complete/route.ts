import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { readMetaClientLinkToken } from "@/lib/meta-client-link";
import { assertMetaClientLinkUnused } from "@/lib/meta-client-link-usage";
import { completeWhatsAppConnection } from "@/lib/meta-whatsapp-onboarding";
import { checkRateLimit } from "@/lib/rate-limit";

const Schema = z.object({
  token: z.string().min(20).max(2_048),
  code: z.string().min(8).max(2_048),
  wabaId: z.string().regex(/^\d{5,}$/),
  phoneNumberId: z.string().regex(/^\d{5,}$/),
  businessId: z.string().regex(/^\d{5,}$/).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json());
    const link = readMetaClientLinkToken(input.token);
    if (link.provider !== "whatsapp") throw new Error("Questo link non è valido per WhatsApp");
    const fingerprint = createHash("sha256").update(input.token).digest("hex").slice(0, 32);
    const attempt = await checkRateLimit(`meta-client-whatsapp:${fingerprint}`, 5, 15 * 60_000);
    if (!attempt.allowed) {
      return NextResponse.json({ success: false, error: "Troppi tentativi. Genera un nuovo link e riprova." }, { status: 429 });
    }
    await assertMetaClientLinkUnused(link);
    const data = await completeWhatsAppConnection({
      botId: link.botId,
      code: input.code,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      businessId: input.businessId,
      clientLinkIssuedAt: link.issuedAt,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Collegamento WhatsApp non riuscito" },
      { status: 400 },
    );
  }
}
