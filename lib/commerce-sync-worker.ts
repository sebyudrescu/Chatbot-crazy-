import "server-only";

import { drainCommerceSyncJob } from "./commerce-sync-queue";

function appOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!configured) return null;
  const value = configured.startsWith("http") ? configured : `https://${configured}`;
  try { return new URL(value).origin; } catch { return null; }
}

async function dispatch(jobId: string, delayMs: number) {
  const origin = appOrigin();
  const secret = process.env.CRON_SECRET;
  if (!origin || !secret) return false;
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 30_000)));
  const response = await fetch(`${origin}/api/internal/commerce-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ jobId }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Dispatcher commerce HTTP ${response.status}`);
  return true;
}

export async function runCommerceSyncWorker(jobId: string) {
  const job = await drainCommerceSyncJob(jobId);
  if (job?.status !== "pending" || job.attempts >= job.maxAttempts) return job;
  const delay = job.nextRetryAt ? Math.max(0, job.nextRetryAt.getTime() - Date.now()) : 0;
  try {
    await dispatch(job.id, delay);
  } catch (error) {
    console.error("[Commerce dispatcher] Il job resta riprendibile:", error);
  }
  return job;
}
