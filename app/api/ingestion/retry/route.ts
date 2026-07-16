import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { retryFailedIngestionJob } from "@/lib/operational-health";
import { processJobManually } from "@/lib/ingestion-worker";

const RetrySchema = z.object({ jobId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const { jobId } = RetrySchema.parse(await request.json());
    const job = await retryFailedIngestionJob(jobId);
    after(async () => {
      try {
        await processJobManually(job.id);
      } catch (error) {
        console.error(`[IngestionRetry] Job ${job.id} failed:`, error);
      }
    });
    return NextResponse.json({
      success: true,
      data: { id: job.id, status: job.status },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "JOB_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Job non trovato" },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === "JOB_NOT_FAILED") {
      return NextResponse.json(
        { success: false, error: "Puoi riprovare soltanto un job fallito" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof z.ZodError
            ? "Identificativo job non valido"
            : "Impossibile riavviare il job",
      },
      { status: 400 },
    );
  }
}
