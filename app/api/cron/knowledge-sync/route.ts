import { NextRequest, NextResponse } from "next/server";
import { scheduleKnowledgeSync } from "@/lib/knowledge-sync";
import { processJobManually } from "@/lib/ingestion-worker";
import { getNextJob, recoverStaleRunningJobs } from "@/lib/ingestion-queue";

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
    const recovered = await recoverStaleRunningJobs();
    const scheduled = await scheduleKnowledgeSync({ limit: 3, activeOnly: true });
    const processedJobIds: string[] = [];
    const failedJobs: Array<{ id: string; error: string }> = [];
    for (let index = 0; index < 3; index += 1) {
      const job = await getNextJob();
      if (!job) break;
      try {
        await processJobManually(job.id);
        processedJobIds.push(job.id);
      } catch (error) {
        failedJobs.push({
          id: job.id,
          error: error instanceof Error ? error.message : "Elaborazione non riuscita",
        });
      }
    }
    return NextResponse.json({
      success: true,
      data: {
        ...scheduled,
        recoveredJobs: recovered.count,
        processedJobIds,
        failedJobs,
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
