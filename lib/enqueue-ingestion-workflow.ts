import "server-only";
import { start } from "workflow/api";
import { ingestionWorkflow } from "@/workflows/ingestion";

export async function enqueueIngestionWorkflow(jobId: string) {
  const run = await start(ingestionWorkflow, [jobId]);
  return { runId: run.runId };
}
