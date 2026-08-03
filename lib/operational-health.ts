import "server-only";
import { prisma } from "./db";

const HOUR = 60 * 60 * 1000;

export async function getOperationalHealth() {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * HOUR);
  const last7Days = new Date(now.getTime() - 7 * 24 * HOUR);
  const staleCutoff = new Date(now.getTime() - 20 * 60 * 1000);

  const [
    pendingJobs,
    runningJobs,
    staleJobs,
    failedJobs,
    failedSources,
    failedAgents,
    indexingAgents,
    webhookFailures,
    recentErrors,
    latestCompletedJob,
    incidents,
  ] = await Promise.all([
    prisma.ingestionJob.count({ where: { status: "pending" } }),
    prisma.ingestionJob.count({ where: { status: "running" } }),
    prisma.ingestionJob.count({
      where: { status: "running", startedAt: { lt: staleCutoff } },
    }),
    prisma.ingestionJob.count({
      where: { status: "failed", completedAt: { gte: last7Days } },
    }),
    prisma.knowledgeSource.count({ where: { status: "failed" } }),
    prisma.chatbot.count({ where: { kbStatus: "failed" } }),
    prisma.chatbot.count({ where: { kbStatus: "indexing" } }),
    prisma.event.count({
      where: {
        eventType: { in: ["integration.webhook.failed", "integration.email.failed"] },
        timestamp: { gte: last24Hours },
      },
    }),
    prisma.event.count({
      where: {
        success: false,
        timestamp: { gte: last24Hours },
        eventType: { notIn: ["integration.webhook.failed", "integration.email.failed"] },
      },
    }),
    prisma.ingestionJob.findFirst({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.ingestionJob.findMany({
      where: { status: "failed", completedAt: { gte: last7Days } },
      orderBy: { completedAt: "desc" },
      take: 8,
      select: {
        id: true,
        botId: true,
        jobType: true,
        errorMessage: true,
        attempts: true,
        maxAttempts: true,
        completedAt: true,
        chatbot: { select: { companyName: true } },
      },
    }),
  ]);

  const critical = staleJobs > 0 || failedAgents > 0;
  const warning =
    failedJobs > 0 ||
    failedSources > 0 ||
    webhookFailures > 0 ||
    recentErrors > 0 ||
    pendingJobs > 10;

  return {
    level: critical ? "critical" : warning ? "warning" : "healthy",
    checkedAt: now,
    ingestion: {
      pending: pendingJobs,
      running: runningJobs,
      stale: staleJobs,
      failedLast7Days: failedJobs,
      latestCompletedAt: latestCompletedJob?.completedAt || null,
    },
    knowledge: {
      failedSources,
      failedAgents,
      indexingAgents,
    },
    integrations: { deliveryFailuresLast24Hours: webhookFailures },
    events: { errorsLast24Hours: recentErrors },
    incidents: incidents.map((job) => ({
      id: job.id,
      botId: job.botId,
      agent: job.chatbot.companyName,
      type: job.jobType,
      error: (job.errorMessage || "Errore di indicizzazione").slice(0, 240),
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      occurredAt: job.completedAt,
    })),
  };
}

export async function retryFailedIngestionJob(jobId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.ingestionJob.findUnique({
      where: { id: jobId },
      select: { id: true, botId: true, status: true },
    });
    if (!job) throw new Error("JOB_NOT_FOUND");
    if (job.status !== "failed") throw new Error("JOB_NOT_FAILED");

    const retried = await tx.ingestionJob.update({
      where: { id: job.id },
      data: {
        status: "pending",
        progress: 0,
        progressMessage: "Nuovo tentativo richiesto manualmente",
        attempts: 0,
        nextRetryAt: new Date(),
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        errorStack: null,
      },
    });
    await tx.chatbot.update({
      where: { id: job.botId },
      data: { kbStatus: "indexing", kbIndexingError: null },
    });
    return retried;
  });
}
