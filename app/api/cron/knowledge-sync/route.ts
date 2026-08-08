import { NextRequest, NextResponse } from "next/server";
import { scheduleKnowledgeSync } from "@/lib/knowledge-sync";
import { enqueueIngestionWorkflow } from "@/lib/enqueue-ingestion-workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: "Accesso non autorizzato" },
      { status: 401 },
    );
  }

  try {
    const scheduled = await scheduleKnowledgeSync({ limit: 3, activeOnly: true });
    const workflows = await Promise.all(
      scheduled.jobs
        .filter((job) => job.status === "pending" || job.status === "running")
        .map(async (job) => ({
          jobId: job.id,
          ...(await enqueueIngestionWorkflow(job.id)),
        })),
    );
    return NextResponse.json({
      success: true,
      data: {
        ...scheduled,
        workflows,
      },
    });
  } catch (error) {
    console.error("Scheduled knowledge sync failed:", error);
    return NextResponse.json(
      { success: false, error: "Sincronizzazione schedulata non riuscita" },
      { status: 500 },
    );
  }
}
