import "server-only";
import { prisma } from "./db";
import { JobStatus } from "./ingestion-queue";
import { processJobManually } from "./ingestion-worker";

const STALE_JOB_MS = 20 * 60 * 1000;

export type IngestionAttemptState = {
  status: string;
  retryAt: Date | null;
};

export async function runIngestionAttempt(
  jobId: string,
): Promise<IngestionAttemptState> {
  "use step";

  let job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  if (!job) return { status: "missing", retryAt: null };
  if ([JobStatus.COMPLETED, JobStatus.FAILED].includes(job.status as JobStatus)) {
    return { status: job.status, retryAt: null };
  }

  if (job.status === JobStatus.RUNNING) {
    const staleAt = new Date((job.startedAt?.getTime() || Date.now()) + STALE_JOB_MS);
    if (staleAt.getTime() > Date.now()) {
      return { status: job.status, retryAt: staleAt };
    }

    const terminal = job.attempts >= job.maxAttempts;
    const recovered = await prisma.ingestionJob.updateMany({
      where: {
        id: job.id,
        status: JobStatus.RUNNING,
        startedAt: job.startedAt,
      },
      data: terminal
        ? {
            status: JobStatus.FAILED,
            completedAt: new Date(),
            errorMessage: "Job interrotto dopo il numero massimo di tentativi",
          }
        : {
            status: JobStatus.PENDING,
            nextRetryAt: new Date(),
            errorMessage: "Worker interrotto: job recuperato automaticamente",
          },
    });
    if (recovered.count === 0) {
      job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
      return { status: job?.status || "missing", retryAt: job?.nextRetryAt || null };
    }
    if (terminal) return { status: JobStatus.FAILED, retryAt: null };
  }

  job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  if (!job) return { status: "missing", retryAt: null };
  if (job.nextRetryAt && job.nextRetryAt.getTime() > Date.now()) {
    return { status: job.status, retryAt: job.nextRetryAt };
  }

  try {
    await processJobManually(jobId);
  } catch (error) {
    console.error(`[IngestionWorkflow] Attempt for ${jobId} failed:`, error);
  }

  const refreshed = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  return {
    status: refreshed?.status || "missing",
    retryAt: refreshed?.nextRetryAt || null,
  };
}

runIngestionAttempt.maxRetries = 3;
