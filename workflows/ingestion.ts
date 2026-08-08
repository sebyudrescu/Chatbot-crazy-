import { sleep } from "workflow";
import { runIngestionAttempt } from "@/lib/ingestion-workflow-step";

export async function ingestionWorkflow(jobId: string) {
  "use workflow";

  while (true) {
    const state = await runIngestionAttempt(jobId);
    if (["completed", "failed", "missing"].includes(state.status)) {
      return { jobId, status: state.status };
    }
    if (state.retryAt) await sleep(state.retryAt);
    else await sleep("5s");
  }
}
