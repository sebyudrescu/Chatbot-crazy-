import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createIngestionJob, JobType } from "@/lib/ingestion-queue";
import { processJobManually } from "@/lib/ingestion-worker";

export const maxDuration = 300;

const CrawlSchema = z.object({
  botId: z.string().uuid(),
  url: z.string().trim().min(1).max(2048),
  maxPages: z.number().int().min(1).max(25).default(10),
  maxDepth: z.number().int().min(0).max(5).default(3),
});

export async function POST(request: NextRequest) {
  try {
    const input = CrawlSchema.parse(await request.json());
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
    after(async () => {
      try {
        await processJobManually(job.id);
      } catch (error) {
        console.error(`[CrawlAPI] Background job ${job.id} failed:`, error);
      }
    });

    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        status: job.status,
        message: "Crawl avviato. Usa l’ID del job per seguire il progresso.",
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
              : "Impossibile avviare il crawl",
      },
      { status: 400 },
    );
  }
}
