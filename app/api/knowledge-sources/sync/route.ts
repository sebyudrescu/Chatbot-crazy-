import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getKnowledgeSyncPreview,
  scheduleKnowledgeSync,
} from "@/lib/knowledge-sync";
import { enqueueIngestionWorkflow } from "@/lib/enqueue-ingestion-workflow";
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from "@/lib/workspace-auth";

const ScheduleSchema = z.object({
  botId: z.string().uuid(),
  limit: z.number().int().min(1).max(10).optional(),
});

const noStore = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    const botId = request.nextUrl.searchParams.get("botId") || undefined;
    if (botId) z.string().uuid().parse(botId);
    if (botId) await requireBotPermission(actor, botId, "chatbot.read");
    return noStore({
      success: true,
      data: await getKnowledgeSyncPreview(botId),
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
    const actor = await requireDashboardActor(request);
    const input = ScheduleSchema.parse(await request.json());
    await requireBotPermission(actor, input.botId, "chatbot.write");
    const scheduled = await scheduleKnowledgeSync(input);
    const workflows = await Promise.all(
      scheduled.jobs
        .filter((job) => job.status === "pending" || job.status === "running")
        .map(async (job) => ({
          jobId: job.id,
          ...(await enqueueIngestionWorkflow(job.id)),
        })),
    );
    return noStore({
      success: true,
      data: { ...scheduled, workflows },
    });
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return noStore(
      {
        success: false,
        error:
          error instanceof z.ZodError
            ? "Richiesta di sincronizzazione non valida"
            : "Sincronizzazione non accodata",
      },
      400,
    );
  }
}
