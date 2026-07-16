import { NextRequest, NextResponse } from "next/server";
import { scheduleKnowledgeSync } from "@/lib/knowledge-sync";
import { processJobManually } from "@/lib/ingestion-worker";
import { recoverStaleRunningJobs } from "@/lib/ingestion-queue";

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
    const scheduled = await scheduleKnowledgeSync({ limit: 1, activeOnly: true });
    const job = scheduled.jobs.find((item) => item.status === "pending");
    if (job) await processJobManually(job.id);
    return NextResponse.json({
      success: true,
      data: {
        ...scheduled,
        recoveredJobs: recovered.count,
        processedJobId: job?.id || null,
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
