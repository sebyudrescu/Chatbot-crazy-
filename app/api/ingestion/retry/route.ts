import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { retryFailedIngestionJob } from "@/lib/operational-health";
import { enqueueIngestionWorkflow } from "@/lib/enqueue-ingestion-workflow";

const RetrySchema = z.object({ jobId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const { jobId } = RetrySchema.parse(await request.json());
    const job = await retryFailedIngestionJob(jobId);
    const workflow = await enqueueIngestionWorkflow(job.id);
    return NextResponse.json({
      success: true,
      data: { id: job.id, status: job.status, workflowRunId: workflow.runId },
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
