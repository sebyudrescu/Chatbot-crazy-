import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createMetaClientLinkToken } from "@/lib/meta-client-link";
import { metaConfiguration, metaReadiness } from "@/lib/meta-config";

const Schema = z.object({
  botId: z.string().uuid(),
  provider: z.enum(["whatsapp", "instagram"]),
});

export async function POST(request: NextRequest) {
  try {
    const input = Schema.parse(await request.json());
    if (!metaReadiness(input.provider)) {
      return NextResponse.json(
        { success: false, error: "Completa prima la configurazione proprietario Meta." },
        { status: 503 },
      );
    }
    const bot = await prisma.chatbot.findUnique({
      where: { id: input.botId },
      select: { id: true },
    });
    if (!bot) return NextResponse.json({ success: false, error: "Agente non trovato" }, { status: 404 });

    const { token, expiresAt } = createMetaClientLinkToken(input.botId, input.provider);
    const appUrl = metaConfiguration().appUrl;
    return NextResponse.json({
      success: true,
      data: {
        url: `${appUrl}/connect/meta?token=${encodeURIComponent(token)}`,
        expiresAt: new Date(expiresAt).toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Link cliente non disponibile" },
      { status: 400 },
    );
  }
}
