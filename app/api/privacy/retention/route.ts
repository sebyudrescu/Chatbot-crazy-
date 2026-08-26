import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cleanupExpiredData, getRetentionPreview } from "@/lib/data-retention";
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from "@/lib/workspace-auth";

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
    const actor = await requireDashboardActor(request);
    if (!botId && actor.kind !== "legacy_owner") {
      return noStore({ success: false, error: "botId obbligatorio per gli account cliente" }, 400);
    }
    if (botId) await requireBotPermission(actor, botId, "analytics.read");
    return noStore({
      success: true,
      data: await getRetentionPreview(botId),
      automationConfigured: false,
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return noStore({ success: false, error: "Agente non valido" }, 400);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = CleanupSchema.parse(await request.json());
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, input.botId, "chatbot.write");
    return noStore({
      success: true,
      data: await cleanupExpiredData(input.botId),
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
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
