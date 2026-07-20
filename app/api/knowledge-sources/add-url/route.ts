import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createIngestionJob, JobType } from "@/lib/ingestion-queue";
import { processJobManually } from "@/lib/ingestion-worker";
import { assertSafeRemoteUrl } from "@/lib/url-safety";

export const maxDuration = 300;

const AddURLSchema = z.object({
  botId: z.string().uuid(),
  url: z.string().trim().min(1).max(2048),
});

export async function POST(request: NextRequest) {
  try {
    const input = AddURLSchema.parse(await request.json());
    const safeUrl = await assertSafeRemoteUrl(input.url);
    const url = safeUrl.toString();
    const bot = await prisma.chatbot.findUnique({
      where: { id: input.botId },
      select: { id: true },
    });
    if (!bot) {
      return NextResponse.json(
        { success: false, error: "Agente non trovato" },
        { status: 404 },
      );
    }
    const existing = await prisma.knowledgeSource.findFirst({
      where: {
        botId: input.botId,
        sourceUrl: { in: [...new Set([url, input.url])] },
        status: { in: ["processing", "completed"] },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Questo URL è già presente nella knowledge base",
          sourceId: existing.id,
        },
        { status: 409 },
      );
    }

    const job = await createIngestionJob(
      input.botId,
      JobType.URL,
      { singleUrl: url },
      6,
    );
    after(async () => {
      try {
        await processJobManually(job.id);
      } catch (error) {
        console.error(`[AddURL] Background job ${job.id} failed:`, error);
      }
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          jobId: job.id,
          url,
          status: job.status,
          message: "URL validato e aggiunto alla coda di indicizzazione.",
        },
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof z.ZodError
            ? error.errors[0].message
            : error instanceof Error
              ? error.message
              : "Impossibile aggiungere l’URL",
      },
      { status: 400 },
    );
  }
}
