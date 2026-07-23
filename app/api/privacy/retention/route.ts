import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cleanupExpiredData, getRetentionPreview } from "@/lib/data-retention";

const CleanupSchema = z.object({
  botId: z.string().uuid(),
  confirmation: z.literal("PULISCI DATI SCADUTI"),
});

const noStore = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET(request: NextRequest) {
  try {
    const botId = request.nextUrl.searchParams.get("botId") || undefined;
    if (botId) z.string().uuid().parse(botId);
    return noStore({
      success: true,
      data: await getRetentionPreview(botId),
      automationConfigured: false,
    });
  } catch {
    return noStore({ success: false, error: "Agente non valido" }, 400);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = CleanupSchema.parse(await request.json());
    return noStore({
      success: true,
      data: await cleanupExpiredData(input.botId),
    });
  } catch (error) {
    return noStore(
      {
        success: false,
        error:
          error instanceof z.ZodError
            ? "Conferma non valida: digita PULISCI DATI SCADUTI"
            : "Pulizia dei dati scaduti non riuscita",
      },
      400,
    );
  }
}
