import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createIngestionJob, JobType } from "@/lib/ingestion-queue";
import { enqueueIngestionWorkflow } from "@/lib/enqueue-ingestion-workflow";
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from "@/lib/workspace-auth";

export const maxDuration = 300;

const CrawlSchema = z.object({
  botId: z.string().uuid(),
  url: z.string().trim().min(1).max(2048),
  maxPages: z.number().int().min(1).max(100).default(10),
  maxDepth: z.number().int().min(0).max(5).default(3),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireDashboardActor(request);
    const input = CrawlSchema.parse(await request.json());
    await requireBotPermission(actor, input.botId, "chatbot.write");
    const chatbot = await prisma.chatbot.findUnique({
      where: { id: input.botId },
      select: { id: true },
    });
    if (!chatbot) {
      return NextResponse.json(
        { success: false, error: "Agente non trovato" },
        { status: 404 },
      );
    }

    const job = await createIngestionJob(
      input.botId,
      JobType.CRAWL,
      {
        url: input.url,
        maxPages: input.maxPages,
        maxDepth: input.maxDepth,
      },
      5,
    );
    const workflow = await enqueueIngestionWorkflow(job.id);

    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        workflowRunId: workflow.runId,
        status: job.status,
        message: "Crawl avviato. Usa l’ID del job per seguire il progresso.",
      },
      { status: 202 },
    );
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof z.ZodError
            ? error.errors[0].message
            : error instanceof Error
              ? error.message
              : "Impossibile avviare il crawl",
      },
      { status: 400 },
    );
  }
}
